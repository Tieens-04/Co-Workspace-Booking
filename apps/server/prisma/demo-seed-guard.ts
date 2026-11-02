/**
 * Policy for the demo seed (shared demo password, sample users):
 * - never runs when NODE_ENV=production;
 * - runs against a MySQL database on this machine (localhost / 127.0.0.1 / ::1);
 * - any other host must be confirmed explicitly by setting
 *   DEMO_SEED_CONFIRM_DATABASE to the exact target database name.
 * Error messages never include the connection string or credentials.
 */
export interface DemoSeedEnv {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  DEMO_SEED_CONFIRM_DATABASE?: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export class DemoSeedRefusedError extends Error {
  constructor(reason: string) {
    super(`Demo seed refused: ${reason}`);
    this.name = 'DemoSeedRefusedError';
  }
}

/** Returns the verified database name, or throws DemoSeedRefusedError. */
export function assertDemoSeedAllowed(env: DemoSeedEnv): string {
  if (env.NODE_ENV === 'production') {
    throw new DemoSeedRefusedError(
      'NODE_ENV=production. Use the admin bootstrap command instead of demo data.',
    );
  }

  let target: URL;
  try {
    target = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw new DemoSeedRefusedError('DATABASE_URL is missing or invalid.');
  }
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  if (target.protocol !== 'mysql:' || !databaseName) {
    throw new DemoSeedRefusedError('DATABASE_URL must be a MySQL URL with a database name.');
  }

  if (LOCAL_HOSTS.has(target.hostname.toLowerCase())) return databaseName;
  if (env.DEMO_SEED_CONFIRM_DATABASE === databaseName) return databaseName;

  throw new DemoSeedRefusedError(
    'database host is not local. Set DEMO_SEED_CONFIRM_DATABASE to the target database name ' +
      'only after verifying it is a disposable dev/test database.',
  );
}
