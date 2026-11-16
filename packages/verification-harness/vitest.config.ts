import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@lathe/verification-harness', include: ['src/**/*.test.ts'] },
});
