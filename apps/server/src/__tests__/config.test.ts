import { afterEach, expect, it, vi } from 'vitest';
import { validateTestDatabase } from './support/test-database.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each(['10.5', '9', '15', 'NaN', 'Infinity'])(
  'fails startup for invalid bcrypt rounds %s',
  async (value) => {
    vi.stubEnv('BCRYPT_SALT_ROUNDS', value);
    vi.resetModules();
    await expect(import('../config/env.config.js')).rejects.toThrow('BCRYPT_SALT_ROUNDS');
  },
);

it.each(['', '0s', '-1h', 'invalid', '3600', '1.5h', '999999999999999999999d'])(
  'fails startup for invalid JWT duration %s',
  async (value) => {
    vi.stubEnv('JWT_EXPIRES_IN', value);
    vi.resetModules();
    await expect(import('../config/env.config.js')).rejects.toThrow('JWT_EXPIRES_IN');
  },
);

it.each([
  ['15m', 900],
  ['1h', 3600],
  ['24h', 86400],
  ['1d', 86400],
  ['30s', 30],
])('normalizes %s to seconds', async (value, seconds) => {
  vi.stubEnv('JWT_EXPIRES_IN', String(value));
  vi.resetModules();
  const { ENV } = await import('../config/env.config.js');
  expect(ENV.JWT_EXPIRES_IN_SECONDS).toBe(seconds);
});

it.each([undefined, 'not a URL', 'mysql://localhost/cospace', 'postgres://localhost/cospace_test'])(
  'refuses unsafe test database configuration',
  (url) => {
    expect(() => validateTestDatabase(url)).toThrow('TEST_DATABASE_URL');
  },
);

it('refuses the development schema even through a host alias', () => {
  expect(() =>
    validateTestDatabase('mysql://localhost/shared_test', 'mysql://127.0.0.1/shared_test'),
  ).toThrow('TEST_DATABASE_URL');
});

it('accepts a separate test schema', () => {
  const url = 'mysql://localhost/cospace_test';
  expect(validateTestDatabase(url, 'mysql://localhost/cospace')).toBe(url);
});
