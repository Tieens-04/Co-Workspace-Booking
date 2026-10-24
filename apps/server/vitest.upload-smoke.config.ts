import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.upload-smoke.test.ts'],
    setupFiles: ['src/__tests__/support/setup.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 180000,
  },
});
