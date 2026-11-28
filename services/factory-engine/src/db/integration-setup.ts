import { migrateEngineDatabase } from './migrations.js';
import { appRoleName, connectAs } from './test-db.js';

/** Vitest global setup: applies pending foundation and engine migrations once. */
export default async function setup(): Promise<void> {
  const owner = await connectAs('owner');
  try {
    const applied = await migrateEngineDatabase(owner, appRoleName());
    console.log(`migrations applied: ${applied.length > 0 ? applied.join(', ') : 'none pending'}`);
  } finally {
    await owner.end();
  }
}
