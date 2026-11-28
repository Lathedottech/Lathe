import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@lathe/factory-engine',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
  },
});
