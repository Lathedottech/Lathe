import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig keeps `jsx: preserve` for Next.js; tests compile JSX with the React 19 runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    name: '@lathe/workspace',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'happy-dom',
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
