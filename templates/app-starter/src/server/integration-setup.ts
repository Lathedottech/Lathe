import { migrate } from '../../scripts/migrate';

/** Vitest global setup: applies the foundation and app migrations once, as the owner role. */
export default async function setup(): Promise<void> {
  const applied = await migrate();
  console.log(`migrations applied: ${applied.length > 0 ? applied.join(', ') : 'none pending'}`);
}
