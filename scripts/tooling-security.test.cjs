const assert = require('node:assert/strict');
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
