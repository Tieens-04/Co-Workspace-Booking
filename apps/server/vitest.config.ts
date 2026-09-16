import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**', 'src/**/*.integration.test.ts'],
    setupFiles: ['src/__tests__/support/setup.ts'],
  },
});
