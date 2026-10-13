import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 10000,
    fileParallelism: false,
    include: ['src/**/*.integration.test.ts'],
    setupFiles: ['src/__tests__/support/integration-setup.ts'],
  },
});
