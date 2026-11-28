import pg from 'pg';

const REQUIRED = [
  'POSTGRES_DB',
  'LATHE_DB_OWNER_ROLE',
  'LATHE_DB_OWNER_PASSWORD',
  'LATHE_DB_APP_ROLE',
  'LATHE_DB_APP_PASSWORD',
] as const;
export type DbRole = 'owner' | 'app';

function env(name: (typeof REQUIRED)[number]): string {
  const value = process.env[name];
  // Fail loudly: an integration test that skips silently cannot fail.
  if (!value) throw new Error(`Integration tests need ${REQUIRED.join(', ')}`);
  return value;
}

function config(role: DbRole): pg.ClientConfig {
  return {
    host: process.env['POSTGRES_HOST'] ?? '127.0.0.1',
    port: Number(process.env['POSTGRES_PORT'] ?? '5432'),
    database: env('POSTGRES_DB'),
    user: role === 'owner' ? env('LATHE_DB_OWNER_ROLE') : env('LATHE_DB_APP_ROLE'),
    password: role === 'owner' ? env('LATHE_DB_OWNER_PASSWORD') : env('LATHE_DB_APP_PASSWORD'),
  };
}

export async function connectAs(role: DbRole): Promise<pg.Client> {
  const client = new pg.Client(config(role));
  await client.connect();
  return client;
}

export function createPool(role: DbRole, max: number): pg.Pool {
  return new pg.Pool({ ...config(role), max });
}

export function appRoleName(): string {
  return env('LATHE_DB_APP_ROLE');
}

/** Returns the PostgreSQL error code `fn` raised, or fails if it succeeded. Follows `cause`. */
export async function expectPgError(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    for (let e: unknown = error; e instanceof Error; e = e.cause) {
      if (e instanceof pg.DatabaseError && e.code) return e.code;
    }
    throw error;
  }
  throw new Error('Expected a PostgreSQL error, but the statement succeeded');
}
