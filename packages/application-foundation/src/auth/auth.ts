import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { accounts, rateLimits, sessions, users, verifications } from './schema.js';

type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

export interface AuthConfig {
  // Any Drizzle schema: the auth tables are passed to the adapter explicitly.
  readonly db: NodePgDatabase<Record<string, unknown>>;
  /** At least 32 characters, from the environment or a secrets manager. Never in code. */
  readonly secret: string;
  /** Public origin of the app, for example `https://support.example.com`. */
  readonly baseURL: string;
  /** Origins allowed to send cookie-bearing requests (CSRF). Usually just `baseURL`. */
  readonly trustedOrigins: readonly string[];
  /** Mount path of the auth handler. `/auth` matches `AUTH_BASE_PATH` in contract C4 v1.1. */
  readonly basePath?: string;
  /** Sign-up is closed unless an app opts in. The demo seed opts in. Default false. */
  readonly allowSignUp?: boolean;
  /**
   * Headers that carry the client IP, used as the rate-limit key. Any client can
   * send `x-forwarded-for`; in production list only the header your proxy sets.
   */
  readonly ipAddressHeaders?: readonly string[];
  /** Session lifetime. Default 7 days. */
  readonly sessionTtlSeconds?: number;
  /** Receives Better Auth's log lines. Default: warnings and errors to stderr. */
  readonly log?: (level: LogLevel, message: string, ...args: unknown[]) => void;
}

const MIN_SECRET_LENGTH = 32;
const DAY = 60 * 60 * 24;

/**
 * Creates the Better Auth instance (task P1-03): email and password, server-side
 * sessions in PostgreSQL, rate-limited sign-in, CSRF origin checks, telemetry off.
 *
 * Settings that Better Auth relaxes automatically under `NODE_ENV=test` (origin
 * check, secret validation) are set explicitly here, so tests exercise the same
 * behaviour as production.
 */
export function createAuth(config: AuthConfig) {
  if (config.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`auth secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  // Better Auth turns telemetry on when this variable is set, whatever the options say.
  const telemetryEnv = process.env['BETTER_AUTH_TELEMETRY'];
  if (telemetryEnv !== undefined && !['', '0', 'false'].includes(telemetryEnv.toLowerCase())) {
    throw new Error('BETTER_AUTH_TELEMETRY must not be enabled: the foundation sends no telemetry');
  }
  if (config.trustedOrigins.length === 0) {
    throw new Error('trustedOrigins must list at least one origin');
  }

  return betterAuth({
    appName: 'lathe',
    baseURL: config.baseURL,
    basePath: config.basePath ?? '/auth',
    secret: config.secret,
    trustedOrigins: [...config.trustedOrigins],
    database: drizzleAdapter(config.db, {
      provider: 'pg',
      schema: { users, sessions, accounts, verifications, rateLimits },
    }),
    user: { modelName: 'users' },
    account: { modelName: 'accounts' },
    verification: { modelName: 'verifications' },
    session: {
      modelName: 'sessions',
      expiresIn: config.sessionTtlSeconds ?? 7 * DAY,
      updateAge: DAY,
      // Every request reads the session from the database, so sign-out and expiry
      // take effect immediately.
      cookieCache: { enabled: false },
      additionalFields: {
        // `input: false`: no client request can set it. Only P1-04 server code does.
        activeOrgId: { type: 'string', required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !(config.allowSignUp ?? false),
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      // No email delivery in the MVP (product non-goal).
      requireEmailVerification: false,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rateLimits',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: 'lathe',
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: 'uuid' },
      ipAddress: { ipAddressHeaders: [...(config.ipAddressHeaders ?? ['x-forwarded-for'])] },
    },
    logger: {
      level: 'warn',
      log:
        config.log ??
        ((level, message) => void process.stderr.write(`[auth] ${level}: ${message}\n`)),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
