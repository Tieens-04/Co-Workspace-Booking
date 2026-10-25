import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { serverEnvironment, testDatabaseUrl } from './env.js';

export function prepareDatabase(): void {
  testDatabaseUrl();
  const require = createRequire(resolve('apps/server/package.json'));
  const result = spawnSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: resolve('apps/server'),
      env: serverEnvironment(),
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('E2E test database migration failed.');
}
