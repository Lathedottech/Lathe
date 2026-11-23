import { z } from 'zod';

/** Variables the running app needs. Values are secrets or config; they are never logged. */
const AppEnv = z.object({
  POSTGRES_HOST: z.string().min(1).default('127.0.0.1'),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65_535).default(5432),
  POSTGRES_DB: z.string().min(1),
  /** The non-owner app role. It has no BYPASSRLS, so RLS applies to every query. */
  LATHE_DB_APP_ROLE: z.string().min(1),
  LATHE_DB_APP_PASSWORD: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Public origin of this app. Cookie-bearing writes from any other origin are refused. */
  LATHE_APP_BASE_URL: z.url().default('http://localhost:3000'),
});
export type AppEnv = z.infer<typeof AppEnv>;

/** Variables the migration script needs: the owner role, never used by the running app. */
const OwnerEnv = z.object({
  POSTGRES_HOST: z.string().min(1).default('127.0.0.1'),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65_535).default(5432),
  POSTGRES_DB: z.string().min(1),
  LATHE_DB_OWNER_ROLE: z.string().min(1),
  LATHE_DB_OWNER_PASSWORD: z.string().min(1),
  LATHE_DB_APP_ROLE: z.string().min(1),
});
export type OwnerEnv = z.infer<typeof OwnerEnv>;

/** Any map of variable names to values, for example `process.env`. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

function parse<T>(schema: z.ZodType<T>, source: EnvSource): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Names only, never values.
    const names = [...new Set(result.error.issues.map((i) => i.path.join('.')))];
    throw new Error(`missing or invalid environment variables: ${names.join(', ')}`);
  }
  return result.data;
}

export const readAppEnv = (source: EnvSource = process.env): AppEnv => parse(AppEnv, source);
export const readOwnerEnv = (source: EnvSource = process.env): OwnerEnv => parse(OwnerEnv, source);
