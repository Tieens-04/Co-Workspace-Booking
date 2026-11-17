import { isIP } from 'node:net';

/** Subset of process environment variables used to construct DATABASE_URL. */
export type DatabaseUrlEnv = Partial<
  Record<'DATABASE_URL' | 'DB_HOST' | 'DB_PORT' | 'DB_NAME' | 'DB_USER' | 'DB_PASSWORD', string>
>;

const DISCRETE_REQUIRED_KEYS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;
// RFC 1123 DNS hostnames plus underscore inside labels for Docker service/container aliases.
const HOSTNAME_RE =
  /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?)*$/;

function normalizeHost(rawHost: string | undefined): string {
  const host = rawHost?.trim();
  if (!host) {
    throw new Error('DB_HOST is required when DATABASE_URL is not set.');
  }
  if (host.startsWith('[') && host.endsWith(']') && isIP(host.slice(1, -1)) === 6) {
    return host;
  }
  if (isIP(host) === 6) {
    return `[${host}]`;
  }
  if (isIP(host) === 4 || HOSTNAME_RE.test(host)) {
    return host;
  }
  throw new Error('DB_HOST must be a valid hostname or IP address.');
}

function parsePort(rawPort: string | undefined): number {
  const portStr = rawPort?.trim() || '3306';
  const port = /^\d+$/.test(portStr) ? Number(portStr) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

/**
 * Resolves DATABASE_URL from an explicit URL or by URL-encoding discrete DB_* credentials.
 * Returns undefined when neither explicit DATABASE_URL nor discrete DB_* variables are present.
 */
export function resolveDatabaseUrl(env: DatabaseUrlEnv): string | undefined {
  const explicit = env.DATABASE_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const hasDiscreteConfig = DISCRETE_REQUIRED_KEYS.some((key) => env[key] !== undefined);
  if (!hasDiscreteConfig) {
    return undefined;
  }

  const normalizedHost = normalizeHost(env.DB_HOST);
  const port = parsePort(env.DB_PORT);

  const user = env.DB_USER?.trim();
  if (!user) {
    throw new Error('DB_USER is required when DATABASE_URL is not set.');
  }

  // Do not trim DB_PASSWORD: it must match MySQL's MYSQL_PASSWORD verbatim.
  const password = env.DB_PASSWORD;
  if (password === undefined || password.length === 0) {
    throw new Error('DB_PASSWORD is required when DATABASE_URL is not set.');
  }

  const dbName = env.DB_NAME?.trim();
  if (!dbName) {
    throw new Error('DB_NAME is required when DATABASE_URL is not set.');
  }

  let candidate: string;
  try {
    candidate = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${normalizedHost}:${port}/${encodeURIComponent(dbName)}`;
    new URL(candidate);
  } catch {
    // Discard native URIError / URL TypeError so credentials can never leak.
    throw new Error('Invalid database connection parameters.');
  }

  return candidate;
}

/**
 * Populates env.DATABASE_URL from discrete DB_* variables when DATABASE_URL is unset/empty.
 */
export function applyDatabaseUrlFromEnv(env: DatabaseUrlEnv = process.env): string | undefined {
  const resolved = resolveDatabaseUrl(env);
  if (resolved && !env.DATABASE_URL?.trim()) {
    env.DATABASE_URL = resolved;
  }
  return resolved;
}
