import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Local runs read the git-ignored root .env. CI provides the same variables.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  test: {
    name: '@lathe/factory-engine:integration',
    include: ['src/**/*.integration.test.ts'],
    // Applies the foundation migrations, then the engine migrations, as the owner role.
    globalSetup: ['src/db/integration-setup.ts'],
    fileParallelism: false,
  },
});
