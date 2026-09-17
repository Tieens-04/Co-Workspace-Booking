import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getStoredToken, removeStoredToken } from '../utils/token';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

type UnauthorizedCallback = (reason: 'sessionExpired') => void;
let unauthorizedCallback: UnauthorizedCallback | null = null;

export function setUnauthorizedHandler(callback: UnauthorizedCallback | null): void {
  unauthorizedCallback = callback;
}

// Request Interceptor: Attach Authorization Bearer token for business endpoints
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const url = config.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');

    if (!isAuthEndpoint) {
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
      const url = error.config?.url || '';
      const isLoginEndpoint = url.includes('/auth/login');

      // 401 from Login keeps form intact, do not treat as session expired
      if (!isLoginEndpoint) {
        const rawAuthHeader =
          error.config?.headers?.Authorization || error.config?.headers?.authorization;
        const authHeaderStr = typeof rawAuthHeader === 'string' ? rawAuthHeader : '';
        const sentToken = authHeaderStr.startsWith('Bearer ')
          ? authHeaderStr.slice(7).trim()
          : null;
        const currentToken = getStoredToken();

        // Stale 401 check: Only clear session if the request actually used the currently active token
        if (sentToken && currentToken && sentToken === currentToken) {
          removeStoredToken();
          if (unauthorizedCallback) {
            unauthorizedCallback('sessionExpired');
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
