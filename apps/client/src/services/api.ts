import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getStoredToken, removeStoredToken } from '../utils/token';

const apiBaseUrl = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/+$/, '')}/api/v1`
  : '/api/v1';

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
] as const;

function normalizeApiPath(url?: string): string {
  if (!url) return '';
  let path = url.split('?')[0].split('#')[0];
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return path;
    }
  }
  const apiPrefixMatch = path.match(/^(?:.*)?\/api\/v1(\/.*|$)/);
  if (apiPrefixMatch) {
    path = apiPrefixMatch[1] || '/';
  }
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return withLeadingSlash.length > 1
    ? withLeadingSlash.replace(/\/+$/, '') || '/'
    : withLeadingSlash;
}

function isPublicAuthUrl(url?: string): boolean {
  const path = normalizeApiPath(url);
  return PUBLIC_AUTH_PATHS.some((publicPath) => path === publicPath);
}

function isMeGetRequest(config?: InternalAxiosRequestConfig): boolean {
  if (!config) return false;
  const method = (config.method ?? 'get').toLowerCase();
  return method === 'get' && normalizeApiPath(config.url) === '/me';
}

export interface UnauthorizedContext {
  isMeRequest: boolean;
}

type UnauthorizedCallback = (reason: 'sessionExpired', context: UnauthorizedContext) => void;
let unauthorizedCallback: UnauthorizedCallback | null = null;

export function setUnauthorizedHandler(callback: UnauthorizedCallback | null): void {
  unauthorizedCallback = callback;
}

// Request Interceptor: Attach Authorization Bearer token for authenticated/business endpoints
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (!isPublicAuthUrl(config.url)) {
      const token = getStoredToken();
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response Interceptor: Handle 401 Unauthorized & prevent stale token race conditions
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // 401 from public auth endpoints keeps form/token flow intact, do not treat as session expired
      if (!isPublicAuthUrl(error.config?.url)) {
        const rawAuthHeader =
          (typeof error.config?.headers?.get === 'function'
            ? error.config.headers.get('Authorization')
            : undefined) ||
          error.config?.headers?.Authorization ||
          error.config?.headers?.authorization;
        const authHeaderStr = typeof rawAuthHeader === 'string' ? rawAuthHeader : '';
        const sentToken = authHeaderStr.startsWith('Bearer ')
          ? authHeaderStr.slice(7).trim()
          : null;
        const currentToken = getStoredToken();

        // Stale 401 check: Only clear session if the request actually used the currently active token
        if (sentToken && currentToken && sentToken === currentToken) {
          removeStoredToken();
          if (unauthorizedCallback) {
            unauthorizedCallback('sessionExpired', {
              isMeRequest: isMeGetRequest(error.config),
            });
          }
        }
      }
    }
    // 403 Forbidden does NOT log out
    return Promise.reject(error);
  },
);

export interface HealthCheckData {
  status: string;
  timestamp: string;
  uptime: number;
  service: string;
}

export const getHealthCheck = async () => {
  const response = await apiClient.get<{
    success: boolean;
    message: string;
    data: HealthCheckData;
  }>('/health');
  return response.data;
};
