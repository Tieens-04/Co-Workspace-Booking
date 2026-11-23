const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtemp, readdir, readFile, rm, writeFile } = require('node:fs/promises');
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

test('Prisma configuration loads patched effect without TemplateLiteral ReDoS (GHSA-7589-6fvf-x4pw)', () => {
  const { version } = prismaRequire('effect/package.json');
  const [major, minor, patch] = version.split('.').map(Number);
  assert.ok(
    major > 3 || (major === 3 && (minor > 22 || (minor === 22 && patch >= 1))),
    `effect ${version} must be >= 3.22.1`,
  );

  const { Schema } = prismaRequire('effect');
  const schema = Schema.TemplateLiteral(Schema.String, ':', Schema.String, ':', Schema.String, 'X');
  const startedAt = performance.now();
  const decoded = Schema.decodeUnknownEither(schema)(':'.repeat(5000));
  const elapsedMs = performance.now() - startedAt;

  assert.equal(decoded._tag, 'Left');
  assert.ok(elapsedMs < 500, `expected linear TemplateLiteral scan (<500ms), got ${elapsedMs}ms`);
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

function parseComposeConfigIfAvailable(repoRoot, envOverrides = {}) {
  const composeProbe = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
  if (composeProbe.status !== 0) return null;
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG)$/i.test(
        key,
      ),
    ),
  );
  Object.assign(cleanEnv, envOverrides);
  const configResult = spawnSync(
    'docker',
    ['compose', '--env-file', '.env.production.example', 'config', '--format', 'json'],
    { cwd: repoRoot, encoding: 'utf8', env: cleanEnv },
  );
  assert.equal(configResult.status, 0, configResult.stderr);
  return JSON.parse(configResult.stdout);
}

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

  const specialPassword = ['ci', 'smoke', 'p@ss:w#rd/1?x=2%253'].join('-');
  const parsed = parseComposeConfigIfAvailable(repoRoot, { DB_PASSWORD: specialPassword });
  if (parsed) {
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

function stripYamlComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'" && line[i + 1] === "'") i += 1;
      else if (ch === "'") quote = null;
    } else if (quote === '"') {
      if (ch === '\\') i += 1;
      else if (ch === '"') quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function extractWorkflowJob(workflowYaml, jobName) {
  const stripped = workflowYaml
    .split(/\r?\n/)
    .map((line) => stripYamlComment(line).trimEnd())
    .join('\n');
  const jobsMatch = /^jobs:\s*$/m.exec(stripped);
  assert.ok(jobsMatch, 'workflow must declare a jobs: section');
  const afterJobs = stripped.slice(jobsMatch.index + jobsMatch[0].length + 1);
  const nextTopLevel = afterJobs.search(/^\S/m);
  const jobsBody = nextTopLevel === -1 ? afterJobs : afterJobs.slice(0, nextTopLevel);
  const jobHeader = new RegExp(`^  ${jobName}:\\s*$`, 'm');
  const match = jobHeader.exec(jobsBody);
  if (!match) return null;
  const afterHeader = jobsBody.slice(match.index + match[0].length + 1);
  const nextJob = afterHeader.search(/^  [A-Za-z0-9_-]+:\s*$/m);
  return nextJob === -1 ? afterHeader : afterHeader.slice(0, nextJob);
}

function splitJobHeaderAndSteps(jobBody, jobName) {
  const stepsMatch = /^    steps:\s*$/m.exec(jobBody);
  assert.ok(stepsMatch, `${jobName} job must declare a steps: section`);
  const header = jobBody.slice(0, stepsMatch.index);
  const stepsRaw = jobBody.slice(stepsMatch.index + stepsMatch[0].length + 1).replace(/^\n+/, '');
  const steps = stepsRaw
    .split(/\n(?=      - )/)
    .map((step) => step.trimEnd())
    .filter((step) => step.startsWith('      - '));
  assert.ok(steps.length > 0, `${jobName} job must declare at least one step`);
  return { header, steps };
}

function jobHasNeed(jobHeader, requiredJob) {
  const scalar = /^    needs:\s*['"]?([A-Za-z0-9_-]+)['"]?\s*$/m.exec(jobHeader);
  if (scalar) return scalar[1] === requiredJob;
  const inlineList = /^    needs:\s*\[([^\r\n\]]*)\]\s*$/m.exec(jobHeader);
  if (inlineList) {
    return inlineList[1]
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .includes(requiredJob);
  }
  const blockList = /^    needs:\s*\n((?:      -\s*[^\n]+\n?)+)/m.exec(jobHeader);
  if (blockList) {
    return blockList[1]
      .trim()
      .split('\n')
      .map((line) =>
        line
          .replace(/^      -\s*/, '')
          .trim()
          .replace(/^['"]|['"]$/g, ''),
      )
      .includes(requiredJob);
  }
  return false;
}

function extractStepRun(step) {
  const blockMatch = /^(?:      - |        )run:\s*[|>][-+]?\s*\n((?:          .*\n?|\n)*)/m.exec(
    step,
  );
  if (blockMatch) return blockMatch[1];
  const inlineMatch = /^(?:      - |        )run:\s*(.+)$/m.exec(step);
  return inlineMatch ? inlineMatch[1].trim() : '';
}

function assertBlockingJob(jobHeader, jobName) {
  assert.doesNotMatch(
    jobHeader,
    /^    continue-on-error:\s*(?:true\b|\$\{\{)/m,
    `${jobName} job must not set continue-on-error`,
  );
  assert.doesNotMatch(
    jobHeader,
    /^    if:\s*(?:false\b|\$\{\{\s*false\b)/m,
    `${jobName} job must not be disabled with if: false`,
  );
}

function assertBlockingStep(step, label) {
  assert.doesNotMatch(
    step,
    /^(?:      - |        )continue-on-error:\s*(?:true\b|\$\{\{)/m,
    `${label} step must not set continue-on-error`,
  );
  assert.doesNotMatch(
    step,
    /^(?:      - |        )if:\s*(?:false\b|\$\{\{\s*false\b)/m,
    `${label} step must not be disabled with if: false`,
  );
}

function assertCiWorkflowConfig(ciYaml) {
  const qualityJob = extractWorkflowJob(ciYaml, 'quality');
  assert.ok(qualityJob, 'CI workflow must define a quality job');
  const quality = splitJobHeaderAndSteps(qualityJob, 'quality');
  assertBlockingJob(quality.header, 'quality');

  const formatStepIndex = quality.steps.findIndex((step) =>
    /\bnpm run format:check\b/.test(extractStepRun(step)),
  );
  const lintStepIndex = quality.steps.findIndex((step) =>
    /\bnpm run lint\b/.test(extractStepRun(step)),
  );
  assert.notEqual(formatStepIndex, -1, 'quality job must run npm run format:check');
  assert.notEqual(lintStepIndex, -1, 'quality job must run npm run lint');
  assert.ok(
    formatStepIndex < lintStepIndex ||
      (formatStepIndex === lintStepIndex &&
        extractStepRun(quality.steps[formatStepIndex]).indexOf('npm run format:check') <
          extractStepRun(quality.steps[lintStepIndex]).indexOf('npm run lint')),
    'quality job must run npm run format:check before npm run lint',
  );
  assertBlockingStep(quality.steps[formatStepIndex], 'quality format:check');

  const smokeJob = extractWorkflowJob(ciYaml, 'docker-smoke');
  assert.ok(smokeJob, 'CI workflow must define a docker-smoke job');
  const smoke = splitJobHeaderAndSteps(smokeJob, 'docker-smoke');
  assertBlockingJob(smoke.header, 'docker-smoke');
  assert.ok(jobHasNeed(smoke.header, 'quality'), 'docker-smoke job must declare needs: quality');

  const npmCiIndex = smoke.steps.findIndex((step) => /\bnpm ci\b/.test(extractStepRun(step)));
  const generateIndex = smoke.steps.findIndex((step) =>
    /\bnpm run db:generate --workspace=apps\/server\b/.test(extractStepRun(step)),
  );
  const uploadSmokeIndex = smoke.steps.findIndex((step) =>
    /\bnpm run test:smoke:upload --workspace=apps\/server\b/.test(extractStepRun(step)),
  );
  const emailSmokeIndex = smoke.steps.findIndex((step) =>
    /\bnpm run test:smoke:email --workspace=apps\/server\b/.test(extractStepRun(step)),
  );
  const artifactIndex = smoke.steps.findIndex((step) =>
    /^(?:      - |        )uses:\s*actions\/upload-artifact@v4\b/m.test(step),
  );

  assert.notEqual(npmCiIndex, -1, 'docker-smoke must run npm ci');
  assert.notEqual(generateIndex, -1, 'docker-smoke must generate Prisma client');
  assert.notEqual(uploadSmokeIndex, -1, 'docker-smoke must run test:smoke:upload');
  assert.notEqual(emailSmokeIndex, -1, 'docker-smoke must run test:smoke:email');
  assert.notEqual(artifactIndex, -1, 'docker-smoke must upload JUnit artifacts');

  assert.ok(npmCiIndex < generateIndex, 'npm ci must run before db:generate in docker-smoke');
  assert.ok(
    generateIndex < uploadSmokeIndex,
    'db:generate must run before test:smoke:upload in docker-smoke',
  );
  assert.ok(
    generateIndex < emailSmokeIndex,
    'db:generate must run before test:smoke:email in docker-smoke',
  );
  assert.ok(
    uploadSmokeIndex < artifactIndex && emailSmokeIndex < artifactIndex,
    'both Docker smoke suites must run before upload-artifact in docker-smoke',
  );

  assertBlockingStep(smoke.steps[npmCiIndex], 'docker-smoke npm ci');
  assertBlockingStep(smoke.steps[generateIndex], 'docker-smoke db:generate');
  assertBlockingStep(smoke.steps[uploadSmokeIndex], 'docker-smoke test:smoke:upload');
  assertBlockingStep(smoke.steps[emailSmokeIndex], 'docker-smoke test:smoke:email');

  assert.match(
    extractStepRun(smoke.steps[uploadSmokeIndex]),
    /--outputFile=\.\.\/\.\.\/reports\/smoke-upload\.xml\b/,
  );
  assert.match(
    extractStepRun(smoke.steps[emailSmokeIndex]),
    /--outputFile=\.\.\/\.\.\/reports\/smoke-email\.xml\b/,
  );
  assert.match(smoke.steps[artifactIndex], /^(?:      - |        )if:\s*always\(\)\s*$/m);
  assert.match(smoke.steps[artifactIndex], /^          path:\s*reports\/smoke-\*\.xml\s*$/m);
}

test('root package.json exposes format:check and Docker smoke test scripts (CWB-121)', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['format:check'] ?? '', /prettier --check/);
  assert.equal(
    pkg.scripts['test:smoke:upload'],
    'npm run test:smoke:upload --workspace=apps/server',
  );
  assert.equal(pkg.scripts['test:smoke:email'], 'npm run test:smoke:email --workspace=apps/server');
});

test('CI workflow enforces format:check in quality and runs Docker smoke suites in docker-smoke (CWB-121)', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const ciYaml = await readFile(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  assertCiWorkflowConfig(ciYaml);
});

test('CI workflow static guard handles quoted #, valid needs forms, and fails closed on neutered or misordered steps (CWB-121)', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const validYaml = (
    await readFile(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8')
  ).replace(/\r\n/g, '\n');

  // Also ensure existing docker-build job with # inside single quotes is never truncated.
  const dockerBuildJob = extractWorkflowJob(validYaml, 'docker-build');
  assert.ok(dockerBuildJob);
  assert.match(dockerBuildJob, /DB_PASSWORD=a@b:c#d\/e\?f%25/);

  // 1. Quoted # inside a shell command must not truncate the rest of the line.
  assert.doesNotThrow(() =>
    assertCiWorkflowConfig(
      validYaml.replace(
        '- run: npm run format:check',
        '- run: echo "gate #1" && npm run format:check',
      ),
    ),
  );

  // 2. Equivalent GitHub Actions needs syntax (inline array & block sequence) must pass.
  assert.doesNotThrow(() =>
    assertCiWorkflowConfig(
      validYaml.replace(/(\n  docker-smoke:\n    needs: )quality/, '$1[secret-scan, quality]'),
    ),
  );
  assert.doesNotThrow(() =>
    assertCiWorkflowConfig(
      validYaml.replace(
        /(\n  docker-smoke:\n    needs:) quality/,
        '$1\n      - secret-scan\n      - quality',
      ),
    ),
  );
  assert.throws(
    () =>
      assertCiWorkflowConfig(
        validYaml.replace(/(\n  docker-smoke:\n    needs: )quality/, '$1secret-scan'),
      ),
    /needs: quality/,
  );

  // 3. Step name spoofing without executing npm run format:check in run: must fail.
  assert.throws(
    () =>
      assertCiWorkflowConfig(
        validYaml.replace(
          '- run: npm run format:check',
          '- name: npm run format:check\n        run: echo skipped',
        ),
      ),
    /format:check/,
  );

  // 4. continue-on-error: true or if: false on format:check or docker-smoke must fail.
  assert.throws(
    () =>
      assertCiWorkflowConfig(
        validYaml.replace(
          '- run: npm run format:check',
          '- name: Format check\n        continue-on-error: true\n        run: npm run format:check',
        ),
      ),
    /continue-on-error/,
  );
  assert.throws(
    () =>
      assertCiWorkflowConfig(
        validYaml.replace(
          '  docker-smoke:\n    needs: quality',
          '  docker-smoke:\n    if: false\n    needs: quality',
        ),
      ),
    /if: false/,
  );

  // 5. Running upload smoke before prisma generate, or upload-artifact without if: always(), must fail.
  assert.throws(
    () =>
      assertCiWorkflowConfig(
        validYaml.replace(
          `      - name: Generate Prisma client\n        run: npm run db:generate --workspace=apps/server\n      - name: Nginx and room image upload smoke tests\n        run: npm run test:smoke:upload --workspace=apps/server -- --reporter=default --reporter=junit --outputFile=../../reports/smoke-upload.xml`,
          `      - name: Nginx and room image upload smoke tests\n        run: npm run test:smoke:upload --workspace=apps/server -- --reporter=default --reporter=junit --outputFile=../../reports/smoke-upload.xml\n      - name: Generate Prisma client\n        run: npm run db:generate --workspace=apps/server`,
        ),
      ),
    /before test:smoke:upload/,
  );
  assert.throws(
    () =>
      assertCiWorkflowConfig(
        validYaml.replace(
          '      - name: Upload smoke test results\n        if: always()',
          '      - name: Upload smoke test results',
        ),
      ),
    /always/,
  );

  // 6. Top-level keys appended after jobs: must not leak into docker-smoke slice.
  assert.throws(
    () =>
      assertCiWorkflowConfig(
        validYaml.replace(
          /      - name: Production Compose and Mailpit email smoke tests[\s\S]*$/,
          'x-disabled:\n  note: npm run test:smoke:email --workspace=apps/server actions/upload-artifact@v4\n',
        ),
      ),
    /test:smoke:email/,
  );
});

test('email smoke test binds loopback DB_PORT=0 and verifies account via Mailpit before booking (CWB-121)', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const smokeTest = await readFile(
    path.join(repoRoot, 'apps/server/src/__tests__/email.email-smoke.test.ts'),
    'utf8',
  );

  assert.match(smokeTest, /['"`]DB_PORT=0['"`]/);
  assert.doesNotMatch(smokeTest, /DB_PORT=127\.0\.0\.1:/);
  assert.match(smokeTest, /\/auth\/verify-email/);
  assert.match(smokeTest, /EMAIL_NOT_VERIFIED/);

  const parsed = parseComposeConfigIfAvailable(repoRoot, { DB_PORT: '0' });
  if (parsed) {
    assert.deepEqual(parsed.services.db.ports, [
      {
        mode: 'ingress',
        host_ip: '127.0.0.1',
        target: 3306,
        published: '0',
        protocol: 'tcp',
      },
    ]);
    assert.equal(parsed.services.server.environment.DB_PORT, '3306');
  }
});

async function listTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(fullPath)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function findShortUuidBookingCodeLines(source) {
  const shortUuidSlice = /\brandomUUID\(\)(?:\.replace\([^)]*\))?\.slice\(\s*0\s*,\s*[1-7]\s*\)/;
  const codeContext = /\b(?:[A-Za-z0-9_]*[Cc]ode[A-Za-z0-9_]*\s*[:=]|CS-)/;
  return source
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => shortUuidSlice.test(line) && codeContext.test(line));
}

test('integration and E2E fixtures never derive bookingCode from <8-hex UUID slices', async () => {
  assert.equal(
    findShortUuidBookingCodeLines(
      'bookingCode: `CS-20261104-${randomUUID().slice(0, 4).toUpperCase()}`',
    ).length,
    1,
  );
  assert.equal(
    findShortUuidBookingCodeLines('const code = `CS-${randomUUID().slice(0, 6).toUpperCase()}-RF1`')
      .length,
    1,
  );
  assert.equal(
    findShortUuidBookingCodeLines('name: `${testPrefix}_Room_${randomUUID().slice(0, 6)}`').length,
    0,
  );

  const repoRoot = path.resolve(__dirname, '..');
  const roots = [path.join(repoRoot, 'apps/server/src/__tests__'), path.join(repoRoot, 'e2e')];
  const violations = [];
  for (const root of roots) {
    for (const file of await listTypeScriptFiles(root)) {
      const content = await readFile(file, 'utf8');
      for (const hit of findShortUuidBookingCodeLines(content)) {
        violations.push(`${path.relative(repoRoot, file)}:${hit.lineNumber}: ${hit.line.trim()}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
