import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@lathe/application-foundation', include: ['src/**/*.test.ts'] },
});
