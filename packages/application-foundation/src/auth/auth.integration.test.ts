import { randomBytes, randomUUID } from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, createPool, deleteTestUsers } from '../db/test-db.js';
import { createAuth, type Auth } from './auth.js';
import { getPrincipal } from './principal.js';
import { seedDemo, type SeededUser } from './seed.js';

const BASE_URL = 'http://localhost:3000';
const EVIL_ORIGIN = 'https://evil.example';
const SESSION_COOKIE = '__Secure-lathe.session_token';
// Generated per run. Only lives in this process.
const SECRET = randomBytes(32).toString('hex');
const PASSWORD = `pw-${randomBytes(12).toString('hex')}`;
const RUN = randomUUID().slice(0, 8);

let pool: pg.Pool;
let db: NodePgDatabase;
let auth: Auth;
const logLines: string[] = [];
let alice: SeededUser;
let bob: SeededUser;
let orgIds: string[] = [];

function config(overrides: Partial<Parameters<typeof createAuth>[0]> = {}) {
  return {
    db,
    secret: SECRET,
    baseURL: BASE_URL,
    trustedOrigins: [BASE_URL],
    log: (level: string, message: string, ...args: unknown[]) =>
      logLines.push(`${level} ${message} ${JSON.stringify(args)}`),
    ...overrides,
  };
}

/** A unique client IP per call site, so the rate limiter does not mix tests. */
const ip = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function call(
  path: string,
  init: { body?: unknown; cookie?: string; origin?: string | null; clientIp?: string } = {},
): Promise<Response> {
  const headers = new Headers({ 'x-forwarded-for': init.clientIp ?? ip() });
  if (init.origin !== null) headers.set('origin', init.origin ?? BASE_URL);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const response = await auth.handler(
    new Request(`${BASE_URL}/auth${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
  );
  return response;
}

function sessionCookie(response: Response): string | undefined {
  const raw = response.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return raw?.split(';')[0];
}

async function signIn(
  email: string,
  password = PASSWORD,
): Promise<{ response: Response; cookie?: string; allCookies: string }> {
  const response = await call('/sign-in/email', { body: { email, password } });
  const cookie = sessionCookie(response);
  // Every cookie the server set, as a browser (or an attacker who stole them) would replay them.
  const allCookies = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return cookie === undefined ? { response, allCookies } : { response, cookie, allCookies };
}

function principalFor(cookie: string | undefined) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return getPrincipal(auth, headers);
}

beforeAll(async () => {
  pool = createPool('app', 4);
  db = createDb(pool);
  auth = createAuth(config());
  const seedAuth = createAuth(config({ allowSignUp: true }));
  const orgA = randomUUID();
  const orgB = randomUUID();
  orgIds = [orgA, orgB];
  [alice, bob] = (await seedDemo(seedAuth, db, {
    orgs: { a: { id: orgA, name: `P1-03 A ${RUN}` }, b: { id: orgB, name: `P1-03 B ${RUN}` } },
    users: [
      {
        name: 'Alice',
        email: `alice-${RUN}@example.test`,
        memberOf: [{ org: 'a', role: 'owner' }],
      },
      {
        name: 'Bob',
        email: `Bob-${RUN}@Example.test`,
        memberOf: [
          { org: 'a', role: 'member' },
          { org: 'b', role: 'owner' },
        ],
      },
    ],
    password: PASSWORD,
  })) as [SeededUser, SeededUser];
});

afterAll(async () => {
  for (const id of orgIds) {
    await pool.query('BEGIN');
    await pool.query("SELECT set_config('app.org_id', $1, true)", [id]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [id]);
    await pool.query('COMMIT');
  }
  await deleteTestUsers(
    pool,
    [alice?.userId, bob?.userId].filter((x): x is NonNullable<typeof x> => !!x),
  );
  await pool?.end();
});

describe('configuration', () => {
  it('rejects a short secret', () => {
    expect(() => createAuth(config({ secret: 'short' }))).toThrow('at least 32 characters');
  });

  it('refuses to start when BETTER_AUTH_TELEMETRY is on', () => {
    process.env['BETTER_AUTH_TELEMETRY'] = 'true';
    try {
      expect(() => createAuth(config())).toThrow('BETTER_AUTH_TELEMETRY');
    } finally {
      delete process.env['BETTER_AUTH_TELEMETRY'];
    }
  });

  it('requires at least one trusted origin', () => {
    expect(() => createAuth(config({ trustedOrigins: [] }))).toThrow('trustedOrigins');
  });
});

describe('seed', () => {
  it('creates users with lower-cased emails and their memberships', async () => {
    expect(bob.email).toBe(`bob-${RUN}@example.test`);
    const result = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM users WHERE id = ANY($1::uuid[])',
      [[alice.userId, bob.userId]],
    );
    expect(result.rows).toEqual([{ n: 2 }]);
  });

  it('stores a password hash, never the password', async () => {
    const result = await pool.query<{ password: string | null }>(
      "SELECT password FROM accounts WHERE user_id = $1 AND provider_id = 'credential'",
      [alice.userId],
    );
    const hash = result.rows[0]?.password ?? '';
    expect(hash.length).toBeGreaterThan(40);
    expect(hash).not.toContain(PASSWORD);
  });
});

describe('sign-up', () => {
  it('is closed by default', async () => {
    const email = `mallory-${RUN}@example.test`;
    const response = await call('/sign-up/email', {
      body: { name: 'Mallory', email, password: PASSWORD },
    });
    expect(response.status).toBe(400);
    const result = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    expect(result.rows).toEqual([]);
  });
});

describe('sign-in and sessions', () => {
  it('signs in with the right password and sets a secure, HttpOnly session cookie', async () => {
    const { response } = await signIn(alice.email);
    expect(response.status).toBe(200);
    const raw =
      response.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';
    expect(raw).toMatch(/;\s*HttpOnly/i);
    expect(raw).toMatch(/;\s*Secure/i);
    expect(raw).toMatch(/;\s*SameSite=Lax/i);
  });

  it('getPrincipal returns the signed-in user and no active org yet', async () => {
    const { cookie } = await signIn(alice.email);
    expect(await principalFor(cookie)).toMatchObject({ userId: alice.userId, activeOrgId: null });
  });

  it('accepts the email in any case', async () => {
    const { response } = await signIn(bob.email.toUpperCase());
    expect(response.status).toBe(200);
  });

  it('answers a wrong password and an unknown email the same way', async () => {
    const wrong = await call('/sign-in/email', {
      body: { email: alice.email, password: 'wrong-password-123' },
    });
    const unknown = await call('/sign-in/email', {
      body: { email: `nobody-${RUN}@example.test`, password: 'wrong-password-123' },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(wrong.status);
    expect(await unknown.json()).toEqual(await wrong.json());
    expect(sessionCookie(wrong)).toBeUndefined();
  });

  it('rejects or ignores a client update-session that sets activeOrgId', async () => {
    const { cookie } = await signIn(alice.email);
    const response = await call('/update-session', {
      body: { activeOrgId: orgIds[1] },
      ...(cookie ? { cookie } : {}),
    });
    expect(response.status).toBeGreaterThanOrEqual(200);
    const principal = await principalFor(cookie);
    expect(principal?.activeOrgId ?? null).toBeNull();
    const rows = await pool.query('SELECT active_org_id FROM sessions WHERE id = $1', [
      principal?.sessionId,
    ]);
    expect(rows.rows).toEqual([{ active_org_id: null }]);
  });

  it('ignores an activeOrgId sent by the client', async () => {
    const response = await call('/sign-in/email', {
      body: { email: alice.email, password: PASSWORD, activeOrgId: orgIds[1] },
    });
    const principal = await principalFor(sessionCookie(response));
    expect(principal?.activeOrgId ?? null).toBeNull();
    const rows = await pool.query(
      'SELECT 1 FROM sessions WHERE user_id = $1 AND active_org_id IS NOT NULL',
      [alice.userId],
    );
    expect(rows.rows).toEqual([]);
  });
});

describe('getPrincipal rejects bad sessions', () => {
  it('returns null without a cookie', async () => {
    expect(await principalFor(undefined)).toBeNull();
  });

  it('returns null for a forged cookie', async () => {
    expect(await principalFor(`${SESSION_COOKIE}=${randomBytes(24).toString('hex')}`)).toBeNull();
  });

  it('returns null when the signature of a real cookie is changed', async () => {
    const { cookie } = await signIn(alice.email);
    const tampered = `${cookie?.slice(0, -3)}${cookie?.endsWith('A') ? 'B' : 'A'}xx`;
    expect(await principalFor(tampered)).toBeNull();
  });

  it('returns null for a valid cookie whose token was swapped for another user\u2019s', async () => {
    const a = await signIn(alice.email);
    const b = await signIn(bob.email);
    const [, aValue] = (a.cookie ?? '').split('=');
    const [, bValue] = (b.cookie ?? '').split('=');
    const [aToken] = decodeURIComponent(aValue ?? '').split('.');
    const [, bSig] = decodeURIComponent(bValue ?? '').split('.');
    expect(
      await principalFor(`${SESSION_COOKIE}=${encodeURIComponent(`${aToken}.${bSig}`)}`),
    ).toBeNull();
  });

  it('returns null after the session expires', async () => {
    const { cookie, allCookies } = await signIn(alice.email);
    const before = await principalFor(cookie);
    expect(before).not.toBeNull();
    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id = $1", [
      before?.sessionId,
    ]);
    expect(await principalFor(cookie)).toBeNull();
    expect(await principalFor(allCookies)).toBeNull();
  });

  it('returns null after sign-out, and the session row is gone', async () => {
    const { cookie, allCookies } = await signIn(alice.email);
    const before = await principalFor(cookie);
    const out = await call('/sign-out', { body: {}, ...(cookie ? { cookie } : {}) });
    expect(out.status).toBe(200);
    expect(await principalFor(cookie)).toBeNull();
    // Replaying every cookie from sign-in must not revive the session either.
    expect(await principalFor(allCookies)).toBeNull();
    const rows = await pool.query('SELECT 1 FROM sessions WHERE id = $1', [before?.sessionId]);
    expect(rows.rows).toEqual([]);
  });
});

describe('CSRF and rate limiting', () => {
  it('rejects sign-in from an untrusted origin', async () => {
    const response = await call('/sign-in/email', {
      body: { email: alice.email, password: PASSWORD },
      origin: EVIL_ORIGIN,
    });
    expect(response.status).toBe(403);
    expect(sessionCookie(response)).toBeUndefined();
  });

  it('rejects sign-out from an untrusted origin, and the session stays valid', async () => {
    const { cookie } = await signIn(alice.email);
    const out = await call('/sign-out', {
      body: {},
      origin: EVIL_ORIGIN,
      ...(cookie ? { cookie } : {}),
    });
    expect(out.status).toBe(403);
    expect(await principalFor(cookie)).not.toBeNull();
  });

  it('limits sign-in attempts to 5 per minute per client', async () => {
    const clientIp = ip();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await call('/sign-in/email', {
        body: { email: alice.email, password: 'wrong-password-123' },
        clientIp,
      });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    // Even the right password is refused while limited.
    const limited = await call('/sign-in/email', {
      body: { email: alice.email, password: PASSWORD },
      clientIp,
    });
    expect(limited.status).toBe(429);
    expect(sessionCookie(limited)).toBeUndefined();
  });
});

describe('no secrets leak', () => {
  it('never logs the password, the secret or a session token', async () => {
    const { cookie } = await signIn(alice.email);
    const token = decodeURIComponent((cookie ?? '').split('=')[1] ?? '').split('.')[0] ?? '';
    const text = logLines.join('\n');
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(SECRET);
    expect(token.length).toBeGreaterThan(10);
    expect(text).not.toContain(token);
  });

  it('never returns the password hash in a response', async () => {
    const { response } = await signIn(alice.email);
    const body = JSON.stringify(await response.json());
    const hash = (
      await pool.query<{ password: string }>(
        "SELECT password FROM accounts WHERE user_id = $1 AND provider_id = 'credential'",
        [alice.userId],
      )
    ).rows[0]?.password;
    expect(body).not.toContain(PASSWORD);
    expect(hash && body.includes(hash)).toBeFalsy();
  });
});
