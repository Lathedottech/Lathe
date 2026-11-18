import { runMigrations } from './migrate.js';
import { connectAs, roleName } from './test-db.js';

/** Vitest global setup for integration tests: applies pending migrations once. */
export default async function setup(): Promise<void> {
  const owner = await connectAs('owner');
  try {
    const applied = await runMigrations(owner, { appRole: roleName('app') });
    console.log(`migrations applied: ${applied.length > 0 ? applied.join(', ') : 'none pending'}`);
  } finally {
    await owner.end();
  }
}
