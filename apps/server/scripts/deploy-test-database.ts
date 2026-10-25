import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { validateTestDatabase } from '../src/__tests__/support/test-database.js';

dotenv.config();
// Validate before starting Prisma: migrate deploy must never target a developer database.
const databaseUrl = validateTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: databaseUrl },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
