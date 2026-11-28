import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { runMigrations } from '@lathe/application-foundation';

/** Directory of the engine's SQL migrations. */
export const ENGINE_MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/**
 * Applies the foundation migrations, then the engine's, as the owner role.
 * The engine tables reference `organizations` and `users` and use
 * `app_current_org_id()`, so the foundation must come first.
 */
export async function migrateEngineDatabase(owner: pg.Client, appRole: string): Promise<string[]> {
  const foundation = await runMigrations(owner, { appRole });
  const engine = await runMigrations(owner, { appRole, dir: ENGINE_MIGRATIONS_DIR });
  return [...foundation, ...engine];
}
