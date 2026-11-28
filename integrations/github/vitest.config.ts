import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    name: '@lathe/github-delivery',
    include: ['src/**/*.test.ts'],
  },
});
