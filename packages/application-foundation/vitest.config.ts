import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@lathe/application-foundation',
    include: ['src/**/*.test.ts'],
    // Integration tests need a real PostgreSQL and run via `pnpm test:integration`.
    exclude: ['src/**/*.integration.test.ts'],
  },
});
