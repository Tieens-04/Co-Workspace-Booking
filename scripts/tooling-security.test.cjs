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

test('dependency audit evaluator fails closed on prod vulns, errors, and non-allowlisted advisories while scoping GHSA-fc5q-39xc-vjpf', () => {
  const { evaluateProdAuditReport, evaluateFullAuditReport } = require('./audit-dependencies.cjs');

  const cleanReport = {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
  };
  assert.deepEqual(evaluateProdAuditReport(cleanReport), { ok: true, errors: [] });
  assert.deepEqual(evaluateFullAuditReport(cleanReport), { ok: true, errors: [], exempted: [] });

  // Registry/network errors or malformed payloads must fail closed.
  assert.equal(evaluateProdAuditReport({ error: { code: 'ENOTFOUND' } }).ok, false);
  assert.equal(evaluateFullAuditReport({ auditReportVersion: 1, vulnerabilities: {} }).ok, false);

  const picomatchUnpatchedGraph = {
    auditReportVersion: 2,
    vulnerabilities: {
      picomatch: {
        name: 'picomatch',
        severity: 'high',
        via: [
          {
            source: 1247710,
            name: 'picomatch',
            url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
            range: '<=4.0.7',
          },
        ],
      },
      tinyglobby: {
        name: 'tinyglobby',
        severity: 'high',
        via: ['picomatch'],
      },
      vite: {
        name: 'vite',
        severity: 'high',
        via: ['picomatch', 'tinyglobby'],
      },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 3, critical: 0, total: 3 } },
  };

  // Production audit NEVER allows even GHSA-fc5q-39xc-vjpf.
  assert.equal(evaluateProdAuditReport(picomatchUnpatchedGraph).ok, false);

  // Full audit allows ONLY the unpatched dev-only picomatch advisory graph.
  const allowedResult = evaluateFullAuditReport(picomatchUnpatchedGraph);
  assert.equal(allowedResult.ok, true);
  assert.equal(allowedResult.exempted.length, 1);
  assert.equal(allowedResult.exempted[0].ghsaId, 'GHSA-fc5q-39xc-vjpf');

  // A second advisory on picomatch or a direct advisory on vite must fail immediately.
  const mixedViteReport = structuredClone(picomatchUnpatchedGraph);
  mixedViteReport.vulnerabilities.vite.via.push({
    source: 9999999,
    name: 'vite',
    url: 'https://github.com/advisories/GHSA-0000-0000-0000',
    range: '<=6.4.5',
  });
  assert.equal(evaluateFullAuditReport(mixedViteReport).ok, false);

  const secondPicomatchAdvisory = structuredClone(picomatchUnpatchedGraph);
  secondPicomatchAdvisory.vulnerabilities.picomatch.via.push({
    source: 9999998,
    name: 'picomatch',
    url: 'https://github.com/advisories/GHSA-1111-2222-3333',
    range: '<=4.0.7',
  });
  assert.equal(evaluateFullAuditReport(secondPicomatchAdvisory).ok, false);
});

function assertClientNginxConfig(nginxConf) {
  // Strip Nginx comments (# at start of line or after whitespace/;/{/}) before parsing blocks.
  const stripped = nginxConf.replace(/(^|[ \t;{}])#[^\r\n]*/gm, '$1');
  const locations = Array.from(
    stripped.matchAll(/\blocation\s+([^{}]+?)\s*\{([^{}]*)\}/g),
    ([full, matcher, body]) => ({ full, matcher: matcher.trim(), body }),
  );

  assert.equal(
    (stripped.match(/\{/g) || []).length,
    locations.length + 1,
    'expected one server block and flat location blocks without nested braces',
  );
  assert.equal(
    (stripped.match(/\}/g) || []).length,
    locations.length + 1,
    'all braces in nginx.conf must be balanced',
  );

  const serverTop = locations.reduce((acc, loc) => acc.replace(loc.full, ''), stripped);
  assert.doesNotMatch(serverTop, /\blocation\b/, 'all location directives must be parsed');
  assert.doesNotMatch(
    serverTop,
    /\bclient_max_body_size\s+(?!1m;)/,
    'server-level client_max_body_size must not exceed 1m',
  );

  const requiredSecurityHeaders = [
    'add_header X-Frame-Options "SAMEORIGIN" always;',
    'add_header X-Content-Type-Options "nosniff" always;',
    'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
  ];

  for (const header of requiredSecurityHeaders) {
    assert.ok(serverTop.includes(header), `server block must declare ${header}`);
  }

  // Nginx drops server-level add_header inheritance in any location declaring add_header.
  for (const location of locations) {
    if (/\badd_header\b/.test(location.body)) {
      for (const header of requiredSecurityHeaders) {
        assert.ok(
          location.body.includes(header),
          `location "${location.matcher}" declares add_header and must repeat ${header}`,
        );
      }
    }
  }

  const staticAssets = locations.find(
    (loc) => loc.matcher.startsWith('~*') && /css\|js/.test(loc.matcher),
  );
  assert.ok(staticAssets, 'static assets regex location must exist');
  assert.ok(
    staticAssets.body.includes('add_header Cache-Control "public, max-age=31536000, immutable";'),
    'static assets must set immutable Cache-Control without always so 404 responses are not cached for 1 year',
  );

  const indexHtml = locations.find((loc) => loc.matcher === '= /index.html');
  assert.ok(indexHtml, 'location = /index.html must exist');
  assert.ok(
    indexHtml.body.includes('add_header Cache-Control "no-cache" always;'),
    'location = /index.html must set Cache-Control: no-cache always',
  );

  const spaRoot = locations.find((loc) => loc.matcher === '/');
  assert.ok(spaRoot, 'location / SPA fallback must exist');
  assert.ok(spaRoot.body.includes('try_files $uri $uri/ /index.html;'));
  assert.doesNotMatch(spaRoot.body, /\badd_header\b/);

  assert.equal(
    locations.find((loc) => /^\^~\s+\/api(?:\/|$)/.test(loc.matcher)),
    undefined,
    'no /api* prefix location may use ^~ or it will shadow the 55m upload regex location',
  );

  const apiLocation = locations.find((loc) => loc.matcher === '/api/');
  assert.ok(apiLocation, 'location /api/ must exist');
  assert.match(apiLocation.body, /\bclient_max_body_size\s+1m;/);
  assert.doesNotMatch(apiLocation.body, /\bclient_max_body_size\s+55m;/);

  const uploadLocation = locations.find(
    (loc) => loc.matcher === '~ ^/api/v1/admin/rooms/[^/]+/images$',
  );
  assert.ok(uploadLocation, 'dedicated room image upload regex location must exist');
  assert.match(uploadLocation.body, /\bclient_max_body_size\s+55m;/);
  assert.match(uploadLocation.body, /\bproxy_pass\s+http:\/\/server:5000;/);
  for (const header of [
    'proxy_set_header X-Real-IP $remote_addr;',
    'proxy_set_header X-Forwarded-For $remote_addr;',
    'proxy_set_header X-Forwarded-Host $host;',
    'proxy_set_header X-Forwarded-Proto $scheme;',
    'proxy_set_header Forwarded "";',
  ]) {
    assert.ok(uploadLocation.body.includes(header), `upload location must declare ${header}`);
  }
}

test('client nginx.conf preserves security headers across add_header locations, scopes 55m to room image upload, and sets no-cache on index.html (CWB-118)', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const nginxConf = await readFile(path.join(repoRoot, 'apps/client/nginx.conf'), 'utf8');
  assertClientNginxConfig(nginxConf);
});

test('nginx.conf static guard fails closed on single-line locations, inline comments, nested blocks, ^~ /api/* shadowing, and server-wide 55m (CWB-118)', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const validConf = await readFile(path.join(repoRoot, 'apps/client/nginx.conf'), 'utf8');

  const injectBeforeClosingServer = (snippet) =>
    validConf.replace(/\r?\n\}\s*$/, `\n${snippet}\n}\n`);

  assert.throws(
    () =>
      assertClientNginxConfig(
        injectBeforeClosingServer(
          '    location = /robots.txt { add_header Cache-Control "public, max-age=3600"; }',
        ),
      ),
    /must repeat/,
  );

  assert.throws(
    () =>
      assertClientNginxConfig(
        injectBeforeClosingServer(
          '    location /manifest.webmanifest { # PWA manifest\n        add_header Cache-Control "public, max-age=86400";\n    }',
        ),
      ),
    /must repeat/,
  );

  assert.throws(
    () =>
      assertClientNginxConfig(
        validConf.replace(
          'add_header Cache-Control "no-cache" always;',
          'add_header Cache-Control "no-cache" always;\n        if ($arg_debug) { add_header X-Debug "1"; }',
        ),
      ),
    /nested braces/,
  );

  assert.throws(
    () =>
      assertClientNginxConfig(
        validConf.replace(
          'proxy_set_header Forwarded "";',
          'proxy_set_header Host $host; # proxy_set_header Forwarded "";',
        ),
      ),
    /Forwarded/,
  );

  assert.doesNotThrow(() =>
    assertClientNginxConfig(
      validConf.replace(
        'try_files $uri $uri/ /index.html;',
        'try_files $uri $uri/ /index.html; # do not add_header here',
      ),
    ),
  );

  assert.throws(
    () =>
      assertClientNginxConfig(
        injectBeforeClosingServer(
          '    location ^~ /api/v1/ {\n        proxy_pass http://server:5000;\n    }',
        ),
      ),
    /shadow/,
  );

  assert.throws(
    () =>
      assertClientNginxConfig(
        validConf.replace('server {', 'server {\n    client_max_body_size 55m;'),
      ),
    /client_max_body_size/,
  );
});
