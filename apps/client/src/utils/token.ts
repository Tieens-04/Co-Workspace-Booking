import { AuthPrincipal, JwtPayload, Role } from '../types/auth';

export const TOKEN_STORAGE_KEY = 'cospace.accessToken';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): boolean {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return localStorage.getItem(TOKEN_STORAGE_KEY) === token;
  } catch {
    return false;
  }
}

export function removeStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage remove errors
  }
}

export function decodeJwt(token: string): JwtPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    // Convert Base64Url to Base64
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // Pad base64 string if necessary
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

    // Decode base64 to UTF-8
    const binaryString = atob(paddedBase64);
    const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
    const jsonString = new TextDecoder().decode(bytes);

    const payload = JSON.parse(jsonString);

    const isValidSub = typeof payload.sub === 'string' && payload.sub.trim().length > 0;
    const isValidRole = payload.role === 'CUSTOMER' || payload.role === 'ADMIN';
    const isValidExp = typeof payload.exp === 'number' && Number.isFinite(payload.exp);

    if (!isValidSub || !isValidRole || !isValidExp) {
      return null;
    }

    return {
      sub: payload.sub,
      role: payload.role as Role,
      exp: payload.exp,
      iat: typeof payload.iat === 'number' ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}

export function isTokenExpired(payload: JwtPayload): boolean {
  return payload.exp * 1000 <= Date.now();
}

export function getValidPrincipalFromToken(token: string | null): AuthPrincipal | null {
  if (!token) return null;

  const payload = decodeJwt(token);
  if (!payload || isTokenExpired(payload)) {
    removeStoredToken();
    return null;
  }

  return {
    id: payload.sub,
    role: payload.role,
  };
}
