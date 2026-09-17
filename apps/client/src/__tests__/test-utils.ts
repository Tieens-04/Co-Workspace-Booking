import { JwtPayload, Role } from '../types/auth';

export function createMockJwt(
  options: {
    sub?: string;
    role?: Role;
    exp?: number;
    iat?: number;
  } = {},
): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: JwtPayload = {
    sub: options.sub ?? 'user-123',
    role: options.role ?? 'CUSTOMER',
    exp: options.exp ?? Math.floor(Date.now() / 1000) + 3600, // 1 hour future
    iat: options.iat ?? Math.floor(Date.now() / 1000),
  };

  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${header}.${body}.mock-signature`;
}
