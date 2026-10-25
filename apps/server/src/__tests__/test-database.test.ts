import { describe, expect, it } from 'vitest';
import { validateTestDatabase } from './support/test-database.js';

describe('test database safety', () => {
  it.each([undefined, '', 'invalid', 'postgres://localhost/app_test', 'mysql://localhost/app'])(
    'rejects unsafe target %s',
    (url) => expect(() => validateTestDatabase(url)).toThrow('TEST_DATABASE_URL'),
  );

  it('rejects the same schema through a different host, user and case', () => {
    expect(() =>
      validateTestDatabase('mysql://ci@127.0.0.1/app_test', 'mysql://dev@localhost/APP_TEST'),
    ).toThrow('TEST_DATABASE_URL');
  });

  it('rejects an invalid development URL', () => {
    expect(() => validateTestDatabase('mysql://localhost/app_test', 'invalid')).toThrow();
  });

  it('accepts a separate MySQL test database', () => {
    const url = 'mysql://ci@localhost/cospace_ci_test';
    expect(validateTestDatabase(url, 'mysql://dev@localhost/cospace')).toBe(url);
    expect(validateTestDatabase(url)).toBe(url);
  });
});
