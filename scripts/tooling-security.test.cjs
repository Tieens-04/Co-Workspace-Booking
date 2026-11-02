const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
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
