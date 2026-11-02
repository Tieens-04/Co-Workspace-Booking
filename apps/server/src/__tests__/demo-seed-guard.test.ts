import { describe, it, expect } from 'vitest';
import { assertDemoSeedAllowed, DemoSeedRefusedError } from '../../prisma/demo-seed-guard.js';

const url = (host: string, db = 'cospace_dev') =>
  `mysql://demo_user:s3cret-pass@${host}:3306/${db}`;

describe('Demo seed guard (CWB-59)', () => {
  it('refuses production even for a local database', () => {
    expect(() =>
      assertDemoSeedAllowed({ NODE_ENV: 'production', DATABASE_URL: url('localhost') }),
    ).toThrow(DemoSeedRefusedError);
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])('allows a local %s database', (host) => {
    expect(assertDemoSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: url(host) })).toBe(
      'cospace_dev',
    );
    expect(assertDemoSeedAllowed({ DATABASE_URL: url(host, 'cospace_test') })).toBe('cospace_test');
  });

  it('refuses a remote database unless the exact database name is confirmed', () => {
    const remote = url('db.internal.example.com', 'cospace_staging');
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: remote })).toThrow(/not local/);
    expect(() =>
      assertDemoSeedAllowed({ DATABASE_URL: remote, DEMO_SEED_CONFIRM_DATABASE: 'cospace' }),
    ).toThrow(DemoSeedRefusedError);
    expect(
      assertDemoSeedAllowed({
        DATABASE_URL: remote,
        DEMO_SEED_CONFIRM_DATABASE: 'cospace_staging',
      }),
    ).toBe('cospace_staging');
  });

  it('still refuses production when a remote database is confirmed', () => {
    expect(() =>
      assertDemoSeedAllowed({
        NODE_ENV: 'production',
        DATABASE_URL: url('db.internal.example.com', 'cospace'),
        DEMO_SEED_CONFIRM_DATABASE: 'cospace',
      }),
    ).toThrow(/production/);
  });

  it.each([undefined, '', 'not a url', 'postgres://u:p@localhost/db', 'mysql://u:p@localhost/'])(
    'refuses a missing or unsupported DATABASE_URL (%s)',
    (databaseUrl) => {
      expect(() => assertDemoSeedAllowed({ DATABASE_URL: databaseUrl })).toThrow(
        DemoSeedRefusedError,
      );
    },
  );

  it('never echoes credentials or the connection string in the refusal', () => {
    try {
      assertDemoSeedAllowed({ DATABASE_URL: url('db.internal.example.com') });
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain('s3cret-pass');
      expect(message).not.toContain('demo_user');
      expect(message).not.toContain('db.internal.example.com');
    }
  });
});
