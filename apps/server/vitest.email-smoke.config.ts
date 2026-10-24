import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: false,
  test: {
    environment: 'node',
    include: ['src/**/*.email-smoke.test.ts'],
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 900000,
  },
});
