import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/application-foundation',
      'packages/verification-harness',
      'packages/shared-contracts',
    ],
  },
});
