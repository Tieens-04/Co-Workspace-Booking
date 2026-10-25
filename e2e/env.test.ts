import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { serverEnvironment, testDatabaseUrl } from './env.js';

const testUrl = 'mysql://test:test@127.0.0.1:3306/browser_test';

function withConfiguration(
  files: Record<string, string>,
  variables: Record<string, string>,
  check: () => void,
) {
  const directory = mkdtempSync(join(tmpdir(), 'cwb49-config-'));
  const previousDirectory = process.cwd();
  const previousEnvironment = { ...process.env };
  try {
    mkdirSync(join(directory, 'apps/server'), { recursive: true });
    for (const [file, content] of Object.entries(files))
      writeFileSync(join(directory, file), content);
    delete process.env.TEST_DATABASE_URL;
    delete process.env.DATABASE_URL;
    Object.assign(process.env, variables);
    process.chdir(directory);
    check();
  } finally {
    process.chdir(previousDirectory);
    for (const key of Object.keys(process.env))
      if (!(key in previousEnvironment)) delete process.env[key];
    Object.assign(process.env, previousEnvironment);
    rmSync(directory, { recursive: true, force: true });
  }
}

test('missing or non-test database is rejected before startup', () => {
  withConfiguration({}, {}, () => assert.throws(testDatabaseUrl, /TEST_DATABASE_URL/));
  withConfiguration({}, { TEST_DATABASE_URL: testUrl.replace('browser_test', 'development') }, () =>
    assert.throws(testDatabaseUrl, /TEST_DATABASE_URL/),
  );
});

test('test schema cannot equal development schema from either dotenv file', () => {
  for (const file of ['.env', 'apps/server/.env']) {
    withConfiguration(
      { [file]: 'DATABASE_URL=mysql://other:other@another-host/browser_test' },
      { TEST_DATABASE_URL: testUrl },
      () => assert.throws(testDatabaseUrl, /TEST_DATABASE_URL/),
    );
  }
});

test('shell test URL wins without changing development configuration', () => {
  withConfiguration(
    { 'apps/server/.env': 'TEST_DATABASE_URL=mysql://test:test@localhost/other_test' },
    { TEST_DATABASE_URL: testUrl, DATABASE_URL: 'mysql://dev:dev@localhost/development' },
    () => {
      assert.equal(testDatabaseUrl(), testUrl);
      assert.equal(process.env.DATABASE_URL, 'mysql://dev:dev@localhost/development');
    },
  );
});

test('backend environment removes both SMTP credential families and real media configuration', () => {
  withConfiguration(
    {},
    {
      TEST_DATABASE_URL: testUrl,
      SMTP_USER: 'external-user',
      SMTP_PASS: 'external-password',
      GMAIL_USER: 'fallback-user',
      GMAIL_APP_PASSWORD: 'fallback-password',
      CLOUDINARY_API_SECRET: 'external-media-secret',
    },
    () => {
      const environment = serverEnvironment();
      for (const key of ['SMTP_USER', 'SMTP_PASS', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'])
        assert.equal(environment[key], '');
      assert.equal(environment.CLOUDINARY_API_SECRET, 'e2e-unused');
      assert.equal(environment.DATABASE_URL, testUrl);
      assert.equal(process.env.SMTP_USER, 'external-user');
    },
  );
});
