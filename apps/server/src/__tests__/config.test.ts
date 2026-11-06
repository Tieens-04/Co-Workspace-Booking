import { afterEach, expect, it, vi } from 'vitest';
import { validateTestDatabase } from './support/test-database.js';

vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([undefined, 'false', 'true'])(
  'sets explicit proxy trust for TRUST_PROXY=%s even in production',
  async (value) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY', value);
    vi.resetModules();
    const { default: app } = await import('../app.js');
    expect(app.get('trust proxy')).toBe(value === 'true' ? 1 : false);
  },
);

it.each(['', '1', '0', 'TRUE', 'yes', 'loopback', ' true '])(
  'fails startup for invalid proxy trust %s',
  async (value) => {
    vi.stubEnv('TRUST_PROXY', value);
    vi.resetModules();
    await expect(import('../config/env.config.js')).rejects.toThrow('TRUST_PROXY');
  },
);

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

it.each(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'])(
  'fails startup when %s is missing or empty',
  async (varName) => {
    vi.stubEnv(varName, '');
    vi.resetModules();
    await expect(import('../config/env.config.js')).rejects.toThrow(varName);
  },
);

it.each(['0', '366', '1.5', '-5', 'abc', '60d'])(
  'fails startup for invalid BOOKING_MAX_ADVANCE_DAYS %s (CWB-75)',
  async (value) => {
    vi.stubEnv('BOOKING_MAX_ADVANCE_DAYS', value);
    vi.resetModules();
    await expect(import('../config/env.config.js')).rejects.toThrow('BOOKING_MAX_ADVANCE_DAYS');
  },
);

it.each([
  [undefined, 60],
  ['', 60],
  ['1', 1],
  ['90', 90],
  ['365', 365],
])('reads BOOKING_MAX_ADVANCE_DAYS=%s as %i days (CWB-75)', async (value, days) => {
  vi.stubEnv('BOOKING_MAX_ADVANCE_DAYS', value);
  vi.resetModules();
  const { ENV } = await import('../config/env.config.js');
  expect(ENV.BOOKING_MAX_ADVANCE_DAYS).toBe(days);
});

it.each(['0', '101', '2.5', '-1', 'five'])(
  'fails startup for invalid BOOKING_MAX_ACTIVE_PER_CUSTOMER %s (CWB-78)',
  async (value) => {
    vi.stubEnv('BOOKING_MAX_ACTIVE_PER_CUSTOMER', value);
    vi.resetModules();
    await expect(import('../config/env.config.js')).rejects.toThrow(
      'BOOKING_MAX_ACTIVE_PER_CUSTOMER',
    );
  },
);

it.each([
  [undefined, 5],
  ['', 5],
  ['1', 1],
  ['10', 10],
  ['100', 100],
])('reads BOOKING_MAX_ACTIVE_PER_CUSTOMER=%s as %i bookings (CWB-78)', async (value, limit) => {
  vi.stubEnv('BOOKING_MAX_ACTIVE_PER_CUSTOMER', value);
  vi.resetModules();
  const { ENV } = await import('../config/env.config.js');
  expect(ENV.BOOKING_MAX_ACTIVE_PER_CUSTOMER).toBe(limit);
});

it.each(['0', '49', '1.5', '-2', 'two'])(
  'fails startup for invalid BOOKING_REMINDER_HOURS %s (CWB-80)',
  async (value) => {
    vi.stubEnv('BOOKING_REMINDER_HOURS', value);
    vi.resetModules();
    await expect(import('../config/env.config.js')).rejects.toThrow('BOOKING_REMINDER_HOURS');
  },
);

it.each([
  [undefined, 2],
  ['', 2],
  ['1', 1],
  ['24', 24],
  ['48', 48],
])('reads BOOKING_REMINDER_HOURS=%s as %i hours (CWB-80)', async (value, hours) => {
  vi.stubEnv('BOOKING_REMINDER_HOURS', value);
  vi.resetModules();
  const { ENV } = await import('../config/env.config.js');
  expect(ENV.BOOKING_REMINDER_HOURS).toBe(hours);
});
