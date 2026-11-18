import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const REQUIRED = [
  'POSTGRES_DB',
  'LATHE_DB_OWNER_ROLE',
  'LATHE_DB_OWNER_PASSWORD',
  'LATHE_DB_APP_ROLE',
  'LATHE_DB_APP_PASSWORD',
] as const;

type RequiredVar = (typeof REQUIRED)[number];

function readEnv(): Record<RequiredVar, string> & { host: string; port: number } {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    // Fail loudly: an integration test that silently skips cannot fail.
    throw new Error(`Integration tests need these environment variables: ${missing.join(', ')}`);
  }
  const values = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] ?? '']));
  return {
    ...(values as Record<RequiredVar, string>),
    host: process.env['POSTGRES_HOST'] ?? '127.0.0.1',
    port: Number(process.env['POSTGRES_PORT'] ?? '5432'),
  };
}

export type DbRole = 'owner' | 'app';

function config(role: DbRole): pg.ClientConfig {
  const env = readEnv();
  return {
    host: env.host,
    port: env.port,
    database: env.POSTGRES_DB,
    user: role === 'owner' ? env.LATHE_DB_OWNER_ROLE : env.LATHE_DB_APP_ROLE,
    password: role === 'owner' ? env.LATHE_DB_OWNER_PASSWORD : env.LATHE_DB_APP_PASSWORD,
  };
}

/** Opens a connection as the migration owner role or the non-owner app role. */
export async function connectAs(role: DbRole): Promise<pg.Client> {
  const client = new pg.Client(config(role));
  await client.connect();
  return client;
}

/** Connection pool as `role`, with at most `max` connections. */
export function createPool(role: DbRole, max: number): pg.Pool {
  return new pg.Pool({ ...config(role), max });
}

export function createDb(pool: pg.Pool): NodePgDatabase {
  return drizzle({ client: pool });
}

export function roleName(role: DbRole): string {
  const env = readEnv();
  return role === 'owner' ? env.LATHE_DB_OWNER_ROLE : env.LATHE_DB_APP_ROLE;
}

/**
 * Runs `fn` and returns the PostgreSQL error code it raised, or fails if it
 * succeeded. Follows `cause`, because Drizzle wraps driver errors.
 */
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
