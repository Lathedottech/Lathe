import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Local runs read the git-ignored root .env. CI provides the same variables directly.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  test: {
    name: '@lathe/application-foundation:integration',
    include: ['src/**/*.integration.test.ts'],
    // Applies pending migrations as the owner role before any test runs.
    globalSetup: ['src/db/integration-setup.ts'],
    // Tests share one database; run files one after another.
    fileParallelism: false,
  },
});
