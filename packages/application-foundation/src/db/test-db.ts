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

export async function connectAs(role: DbRole): Promise<pg.Client> {
  const env = readEnv();
  const client = new pg.Client({
    host: env.host,
    port: env.port,
    database: env.POSTGRES_DB,
    user: role === 'owner' ? env.LATHE_DB_OWNER_ROLE : env.LATHE_DB_APP_ROLE,
    password: role === 'owner' ? env.LATHE_DB_OWNER_PASSWORD : env.LATHE_DB_APP_PASSWORD,
  });
  await client.connect();
  return client;
}

export function roleName(role: DbRole): string {
  const env = readEnv();
  return role === 'owner' ? env.LATHE_DB_OWNER_ROLE : env.LATHE_DB_APP_ROLE;
}

export async function expectPgError(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof pg.DatabaseError && error.code) {
      return error.code;
    }
    throw error;
  }
  throw new Error('Expected a PostgreSQL error, but the statement succeeded');
}
