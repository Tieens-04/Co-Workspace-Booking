const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

// Exercise the exact dependency used by Prisma, including the scoped override.
const configPath = require.resolve('@prisma/config');
const prismaRequire = createRequire(configPath);
const { deepmerge } = prismaRequire('deepmerge-ts');

test('Prisma configuration merger handles recursive input without stack exhaustion', () => {
  const left = { schema: 'schema.prisma' };
  const right = { migrations: { path: 'migrations' } };
  left.self = left;
  right.self = right;

  const merged = deepmerge(left, right);
  assert.equal(merged.schema, 'schema.prisma');
  assert.equal(merged.migrations.path, 'migrations');
  assert.equal(merged.self, merged);
});

test('Prisma 6 loads a configuration file with the patched merger', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cospace-prisma-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configFile = path.join(directory, 'prisma.config.cjs');
  await writeFile(
    configFile,
    `const { defineConfig } = require(${JSON.stringify(configPath)});
module.exports = defineConfig({ schema: './schema.prisma', migrations: { path: './migrations', seed: 'node seed.cjs' } });
`,
  );

  const { loadConfigFromFile } = require('@prisma/config');
  const loaded = await loadConfigFromFile({ configRoot: directory, configFile });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.resolvedPath, configFile);
  assert.equal(loaded.config.schema, path.join(directory, 'schema.prisma'));
  assert.equal(loaded.config.migrations.path, path.join(directory, 'migrations'));
  assert.equal(loaded.config.migrations.seed, 'node seed.cjs');
});

test('ESLint config matching uses the patched glob matcher', async () => {
  // Resolve through ESLint itself so the overridden transitive copy is exercised.
  const eslintRequire = createRequire(require.resolve('eslint/package.json'));
  const configArrayRequire = createRequire(eslintRequire.resolve('@eslint/config-array'));
  const { version } = configArrayRequire('minimatch/package.json');
  const [major, minor, patch] = version.split('.').map(Number);
  assert.ok(major > 11 || (major === 11 && (minor > 0 || patch >= 1)), `minimatch ${version}`);

  const { ConfigArray } = configArrayRequire('@eslint/config-array');
  const configs = new ConfigArray([{ files: ['src/**/*.ts'] }], {
    basePath: path.resolve('/project'),
  });
  await configs.normalize();
  assert.equal(configs.getConfigStatus(path.resolve('/project/src/a/b.ts')), 'matched');
  assert.equal(configs.getConfigStatus(path.resolve('/project/test/b.ts')), 'unconfigured');
});

test('real env files are git-ignored everywhere while *.example templates stay tracked', () => {
  const repoRoot = path.resolve(__dirname, '..');
  // --no-index checks the patterns themselves, independent of what is currently tracked.
  const isIgnored = (file) => {
    const result = spawnSync('git', ['check-ignore', '-q', '--no-index', file], { cwd: repoRoot });
    assert.ok(result.status === 0 || result.status === 1, `git check-ignore failed for ${file}`);
    return result.status === 0;
  };

  for (const dir of ['', 'apps/server/', 'apps/client/']) {
    for (const name of [
      '.env',
      '.env.local',
      '.env.production',
      '.env.test',
      '.env.staging.local',
    ]) {
      assert.equal(isIgnored(`${dir}${name}`), true, `${dir}${name} must be ignored`);
    }
  }
  for (const template of [
    '.env.example',
    '.env.production.example',
    'apps/server/.env.example',
    'apps/server/.env.production.example',
    'apps/client/.env.production.example',
  ]) {
    assert.equal(isIgnored(template), false, `${template} must stay tracked`);
  }
});

test('client Dockerfile healthcheck probes IPv4 127.0.0.1 instead of localhost (CWB-117)', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const dockerfile = await readFile(path.join(repoRoot, 'apps/client/Dockerfile'), 'utf8');
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*http:\/\/127\.0\.0\.1\//);
  assert.doesNotMatch(dockerfile, /http:\/\/localhost\//);
});

test('docker-compose.yml uses silent mysqladmin ping and discrete DB_* vars without raw DB_PASSWORD URL interpolation (CWB-117)', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const compose = await readFile(path.join(repoRoot, 'docker-compose.yml'), 'utf8');

  assert.match(
    compose,
    /test:\s*\['CMD',\s*'mysqladmin',\s*'ping',\s*'-h',\s*'127\.0\.0\.1',\s*'--silent'\]/,
  );
  assert.doesNotMatch(compose, /mysqladmin[^\r\n]*(-p|\bMYSQL_ROOT_PASSWORD\b|\bDB_PASSWORD\b)/);
  assert.doesNotMatch(compose, /^\s*DATABASE_URL\s*:/m);
  assert.doesNotMatch(compose, /^\s*NODE_OPTIONS\s*:/m);
  assert.match(compose, /DB_HOST:\s*db/);
  assert.match(compose, /DB_PORT:\s*['"]?3306['"]?/);
  assert.match(compose, /DB_NAME:\s*\$\{DB_NAME:-cospace_db\}/);
  assert.match(compose, /DB_USER:\s*\$\{DB_USER:-cospace_user\}/);
  assert.match(compose, /DB_PASSWORD:\s*\$\{DB_PASSWORD\}/);
  assert.match(
    compose,
    /wget',\s*'--no-verbose',\s*'--tries=1',\s*'--spider',\s*'http:\/\/127\.0\.0\.1\/'/,
  );
  assert.doesNotMatch(compose, /wget[^\r\n]*localhost/);

  const serverDockerfile = await readFile(path.join(repoRoot, 'apps/server/Dockerfile'), 'utf8');
  assert.match(
    serverDockerfile,
    /COPY --from=builder \/app\/apps\/server\/dist \.\/apps\/server\/dist[\s\S]*ENV NODE_OPTIONS="--import=file:\/\/\/app\/apps\/server\/dist\/config\/register-database-url\.js"/,
  );

  const composeProbe = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
  if (composeProbe.status === 0) {
    const specialPassword = ['ci', 'smoke', 'p@ss:w#rd/1?x=2%253'].join('-');
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG)$/i.test(
          key,
        ),
      ),
    );
    cleanEnv.DB_PASSWORD = specialPassword;

    const configResult = spawnSync(
      'docker',
      ['compose', '--env-file', '.env.production.example', 'config', '--format', 'json'],
      { cwd: repoRoot, encoding: 'utf8', env: cleanEnv },
    );
    assert.equal(configResult.status, 0, configResult.stderr);

    const parsed = JSON.parse(configResult.stdout);
    assert.deepEqual(parsed.services.db.healthcheck.test, [
      'CMD',
      'mysqladmin',
      'ping',
      '-h',
      '127.0.0.1',
      '--silent',
    ]);
    assert.deepEqual(parsed.services.client.healthcheck.test, [
      'CMD',
      'wget',
      '--no-verbose',
      '--tries=1',
      '--spider',
      'http://127.0.0.1/',
    ]);
    assert.equal(parsed.services.server.environment.DATABASE_URL, undefined);
    assert.equal(parsed.services.server.environment.NODE_OPTIONS, undefined);
    assert.equal(parsed.services.server.environment.DB_HOST, 'db');
    assert.equal(parsed.services.server.environment.DB_PORT, '3306');
    assert.equal(parsed.services.server.environment.DB_NAME, 'cospace_db');
    assert.equal(parsed.services.server.environment.DB_USER, 'cospace_user');
    assert.equal(parsed.services.server.environment.DB_PASSWORD, specialPassword);
    assert.equal(parsed.services.db.environment.MYSQL_PASSWORD, specialPassword);
  }
});
