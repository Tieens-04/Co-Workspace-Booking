import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { applyDatabaseUrlFromEnv, resolveDatabaseUrl } from '../config/database-url.config.js';
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

it('URL-encodes special characters and preserves spaces in discrete DB_* credentials (CWB-117)', () => {
  const password = ' p@ss:w#rd/1?x=2%25&a+b=c[] ';
  const user = 'co:space/user@1';
  const dbName = 'cospace#db?v=1';

  const url = resolveDatabaseUrl({
    DB_HOST: 'db',
    DB_PORT: '3307',
    DB_USER: user,
    DB_PASSWORD: password,
    DB_NAME: dbName,
  });

  expect(url).toBeDefined();
  const parsed = new URL(url!);
  expect(parsed.protocol).toBe('mysql:');
  expect(parsed.hostname).toBe('db');
  expect(parsed.port).toBe('3307');
  expect(decodeURIComponent(parsed.username)).toBe(user);
  expect(decodeURIComponent(parsed.password)).toBe(password);
  expect(decodeURIComponent(parsed.pathname.slice(1))).toBe(dbName);
});

it('returns undefined when neither DATABASE_URL nor discrete DB_* vars are configured (CWB-117)', () => {
  expect(resolveDatabaseUrl({})).toBeUndefined();
  expect(resolveDatabaseUrl({ DATABASE_URL: '' })).toBeUndefined();
  expect(resolveDatabaseUrl({ DB_PORT: '3306' })).toBeUndefined();
});

it.each([
  ['127.0.0.1', '127.0.0.1'],
  ['db', 'db'],
  ['cospace_mysql', 'cospace_mysql'],
  ['mysql-primary.internal', 'mysql-primary.internal'],
  ['[::1]', '[::1]'],
  ['::1', '[::1]'],
  ['2001:db8::1', '[2001:db8::1]'],
])('accepts host %s and normalizes hostname to %s (CWB-117)', (host, expectedHostname) => {
  const url = resolveDatabaseUrl({
    DB_HOST: host,
    DB_USER: 'cospace_user',
    DB_PASSWORD: 'secret-password',
    DB_NAME: 'cospace_db',
  });
  expect(url).toBeDefined();
  const parsed = new URL(url!);
  expect(parsed.hostname).toBe(expectedHostname);
  expect(parsed.port).toBe('3306');
});

type RejectCase = {
  label: string;
  env: Record<string, string>;
  match?: RegExp;
};

it.each<RejectCase>([
  {
    label: 'missing DB_HOST',
    env: { DB_USER: 'u', DB_PASSWORD: 'super-secret-sentinel-@123', DB_NAME: 'd' },
  },
  {
    label: 'empty DB_HOST',
    env: { DB_HOST: '  ', DB_USER: 'u', DB_PASSWORD: 'super-secret-sentinel-@123', DB_NAME: 'd' },
  },
  {
    label: 'missing DB_USER',
    env: { DB_HOST: 'db', DB_PASSWORD: 'super-secret-sentinel-@123', DB_NAME: 'd' },
  },
  { label: 'missing DB_PASSWORD', env: { DB_HOST: 'db', DB_USER: 'u', DB_NAME: 'd' } },
  {
    label: 'empty DB_PASSWORD',
    env: { DB_HOST: 'db', DB_USER: 'u', DB_PASSWORD: '', DB_NAME: 'd' },
  },
  {
    label: 'missing DB_NAME',
    env: { DB_HOST: 'db', DB_USER: 'u', DB_PASSWORD: 'super-secret-sentinel-@123' },
  },
  {
    label: 'unpaired surrogate DB_PASSWORD',
    env: { DB_HOST: 'db', DB_USER: 'u', DB_PASSWORD: 'super-secret-sentinel-\uD800', DB_NAME: 'd' },
    match: /^Invalid database connection parameters\.$/,
  },
  ...['0', '65536', '-1', 'abc', '3306.5', '127.0.0.1:0'].map((port) => ({
    label: `invalid DB_PORT ${port}`,
    env: {
      DB_HOST: 'db',
      DB_PORT: port,
      DB_USER: 'u',
      DB_PASSWORD: 'super-secret-sentinel-@123',
      DB_NAME: 'd',
    },
  })),
  ...[
    'db:3306',
    'evil@db',
    'db/path',
    'db?x=1',
    'db#frag',
    'db host',
    'db\\x',
    '[bad]',
    "db'x",
    'db"x',
    'db%40evil.com',
    'db;3306',
    'db$bad',
    '1:2:3',
    '::::',
    'db\x1bevil',
    '[127.0.0.1]',
    '-badhost',
    'badhost-',
  ].map((badHost) => ({
    label: `invalid DB_HOST ${badHost}`,
    env: {
      DB_HOST: badHost,
      DB_USER: 'u',
      DB_PASSWORD: 'super-secret-sentinel-@123',
      DB_NAME: 'd',
    },
    match: /DB_HOST/,
  })),
])('rejects $label without leaking secrets (CWB-117)', ({ env, match }) => {
  let caught: unknown;
  try {
    resolveDatabaseUrl(env);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Error);
  const error = caught as Error;
  if (match) {
    expect(error.message).toMatch(match);
  }
  expect(error.message).not.toContain('super-secret-sentinel');
  expect(String(error)).not.toContain('super-secret-sentinel');
});

it('applyDatabaseUrlFromEnv populates DATABASE_URL when empty and preserves existing explicit URL (CWB-117)', () => {
  const env: Record<string, string | undefined> = {
    DATABASE_URL: '',
    DB_HOST: 'db',
    DB_PORT: '3306',
    DB_NAME: 'cospace_db',
    DB_USER: 'cospace_user',
    DB_PASSWORD: 'p@ss:w#rd/1?x=2%3',
  };
  const resolved = applyDatabaseUrlFromEnv(env);
  expect(resolved).toBe('mysql://cospace_user:p%40ss%3Aw%23rd%2F1%3Fx%3D2%253@db:3306/cospace_db');
  expect(env.DATABASE_URL).toBe(resolved);

  const explicitEnv: Record<string, string | undefined> = {
    DATABASE_URL: 'mysql://keep:me@localhost:3306/keep_db',
    DB_HOST: 'db',
    DB_PORT: '3306',
    DB_USER: 'other',
    DB_PASSWORD: 'other',
    DB_NAME: 'other',
  };
  expect(applyDatabaseUrlFromEnv(explicitEnv)).toBe('mysql://keep:me@localhost:3306/keep_db');
  expect(explicitEnv.DATABASE_URL).toBe('mysql://keep:me@localhost:3306/keep_db');
});

it('wires discrete DB_* credentials into DATABASE_URL on env.config import (CWB-117)', async () => {
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('DB_HOST', 'db');
  vi.stubEnv('DB_PORT', '3306');
  vi.stubEnv('DB_NAME', 'cospace_db');
  vi.stubEnv('DB_USER', 'cospace_user');
  vi.stubEnv('DB_PASSWORD', 'p@ss:w#rd/1?x=2%3');
  vi.resetModules();

  await import('../config/env.config.js');
  expect(process.env.DATABASE_URL).toBe(
    'mysql://cospace_user:p%40ss%3Aw%23rd%2F1%3Fx%3D2%253@db:3306/cospace_db',
  );
});

it('wires discrete DB_* credentials into DATABASE_URL before PrismaClient instantiation in prisma.util (CWB-117)', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('DB_HOST', 'db');
  vi.stubEnv('DB_PORT', '3306');
  vi.stubEnv('DB_NAME', 'cospace_db');
  vi.stubEnv('DB_USER', 'cospace_user');
  vi.stubEnv('DB_PASSWORD', 'p@ss:w#rd/1?x=2%3');
  vi.resetModules();

  const globalForPrisma = globalThis as unknown as { prisma?: unknown };
  const previousGlobalPrisma = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;

  let urlAtConstruct: string | undefined;
  vi.doMock('@prisma/client', () => ({
    PrismaClient: class {
      constructor() {
        urlAtConstruct = process.env.DATABASE_URL;
      }
    },
  }));
  vi.doUnmock('../utils/prisma.util.js');

  try {
    await import('../utils/prisma.util.js');
    expect(urlAtConstruct).toBe(
      'mysql://cospace_user:p%40ss%3Aw%23rd%2F1%3Fx%3D2%253@db:3306/cospace_db',
    );
  } finally {
    globalForPrisma.prisma = previousGlobalPrisma;
    vi.doUnmock('@prisma/client');
    vi.doMock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));
  }
});

it('preloads DATABASE_URL via NODE_OPTIONS register-database-url in a child process and stays silent when unset (CWB-117)', () => {
  const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const registerTsUrl = pathToFileURL(
    resolve(serverRoot, 'src/config/register-database-url.ts'),
  ).href;
  const nodeOptions = `--import=tsx --import=${registerTsUrl}`;

  const populated = execFileSync(
    process.execPath,
    ['-e', 'process.stdout.write(process.env.DATABASE_URL ?? "")'],
    {
      cwd: serverRoot,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        WINDIR: process.env.WINDIR,
        NODE_OPTIONS: nodeOptions,
        DB_HOST: 'db',
        DB_PORT: '3306',
        DB_NAME: 'cospace_db',
        DB_USER: 'cospace_user',
        DB_PASSWORD: 'p@ss:w#rd/1?x=2%3',
      },
    },
  );
  expect(populated).toBe('mysql://cospace_user:p%40ss%3Aw%23rd%2F1%3Fx%3D2%253@db:3306/cospace_db');

  const unconfigured = execFileSync(
    process.execPath,
    ['-e', 'process.stdout.write(String(process.env.DATABASE_URL === undefined))'],
    {
      cwd: serverRoot,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        WINDIR: process.env.WINDIR,
        NODE_OPTIONS: nodeOptions,
      },
    },
  );
  expect(unconfigured).toBe('true');
});
