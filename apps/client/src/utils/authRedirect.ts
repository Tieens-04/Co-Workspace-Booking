import { Role } from '../types/auth';

const UUID_SEGMENT = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const PROTECTED_PREFIXES = ['/bookings', '/booking-confirmation', '/account', '/admin'] as const;

const CUSTOMER_ALLOWED_PATTERNS: RegExp[] = [
  /^\/rooms$/i,
  /^\/rooms\/[a-zA-Z0-9_-]+$/i,
  /^\/bookings$/i,
  new RegExp(`^\\/bookings\\/${UUID_SEGMENT}$`, 'i'),
  /^\/booking-confirmation$/i,
  new RegExp(`^\\/booking-confirmation\\/${UUID_SEGMENT}$`, 'i'),
  /^\/account$/i,
];

const ADMIN_ALLOWED_PATTERNS: RegExp[] = [
  /^\/admin$/i,
  /^\/admin(?:\/[a-zA-Z0-9_-]+)+$/i,
  /^\/account$/i,
];

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function hasUnsafeControlOrDelimiter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || value[i] === '\\' || value[i] === '#') {
      return true;
    }
  }
  return false;
}

function parseSafeInternalTarget(rawTarget: unknown): { pathname: string; search: string } | null {
  if (typeof rawTarget !== 'string' || !rawTarget.startsWith('/') || rawTarget.startsWith('//')) {
    return null;
  }
  if (hasUnsafeControlOrDelimiter(rawTarget)) {
    return null;
  }

  const queryIndex = rawTarget.indexOf('?');
  const rawPathname = queryIndex === -1 ? rawTarget : rawTarget.slice(0, queryIndex);
  const search = queryIndex === -1 ? '' : rawTarget.slice(queryIndex);

  if (
    !rawPathname.startsWith('/') ||
    rawPathname.includes('//') ||
    /%2e|%2f|%5c/i.test(rawPathname) ||
    rawPathname.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    return null;
  }

  return {
    pathname: stripTrailingSlash(rawPathname),
    search,
  };
}

/** Preserves pathname and query string when building a login return target. */
export function formatReturnTo(location: { pathname: string; search?: string }): string {
  return `${location.pathname}${location.search ?? ''}`;
}

/** Returns true when the pathname refers to the `/login` route (case- and trailing-slash-insensitive). */
export function isLoginPathname(pathname: string): boolean {
  return stripTrailingSlash(pathname).toLowerCase() === '/login';
}

/** Returns true for routes that require an authenticated session. */
export function isProtectedPathname(pathname: string): boolean {
  const normalized = stripTrailingSlash(pathname).toLowerCase();
  return PROTECTED_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/**
 * Determines the safe `state.from` return target when redirecting an expired session to `/login`.
 * Excludes non-returnable auth routes such as `/verify-email`, `/reset-password`, `/forgot-password`, and `/register`.
 */
export function getLoginRedirectFrom(currentLocation: {
  pathname: string;
  search?: string;
  state?: unknown;
}): string | undefined {
  const candidate = isLoginPathname(currentLocation.pathname)
    ? (currentLocation.state as { from?: unknown } | null)?.from
    : formatReturnTo(currentLocation);

  const parsed = parseSafeInternalTarget(candidate);
  if (!parsed) {
    return undefined;
  }

  const isReturnable =
    CUSTOMER_ALLOWED_PATTERNS.some((pattern) => pattern.test(parsed.pathname)) ||
    ADMIN_ALLOWED_PATTERNS.some((pattern) => pattern.test(parsed.pathname));

  return isReturnable ? `${parsed.pathname}${parsed.search}` : undefined;
}

/**
 * Validates and resolves the post-login destination for a given role.
 * Rejects external/protocol-relative URLs, path traversal, and cross-role targets.
 */
export function resolvePostLoginRedirect(role: Role, rawFrom: unknown): string {
  const fallback = role === 'ADMIN' ? '/admin' : '/';
  const parsed = parseSafeInternalTarget(rawFrom);
  if (!parsed) {
    return fallback;
  }

  const patterns = role === 'ADMIN' ? ADMIN_ALLOWED_PATTERNS : CUSTOMER_ALLOWED_PATTERNS;
  return patterns.some((pattern) => pattern.test(parsed.pathname))
    ? `${parsed.pathname}${parsed.search}`
    : fallback;
}
