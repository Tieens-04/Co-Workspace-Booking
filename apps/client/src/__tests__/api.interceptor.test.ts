import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosHeaders } from 'axios';
import { apiClient, setUnauthorizedHandler } from '../services/api';
import { setStoredToken, getStoredToken } from '../utils/token';

describe('apiClient interceptors', () => {
  beforeEach(() => {
    localStorage.clear();
    setUnauthorizedHandler(null);
  });

  it('attaches Bearer token for general endpoints', async () => {
    setStoredToken('test-token-123');
    let capturedAuth: string | null = null;

    apiClient.defaults.adapter = async (config) => {
      const headers = config.headers as AxiosHeaders;
      capturedAuth = headers?.get?.('Authorization') as string;
      return {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await apiClient.get('/rooms');
    expect(capturedAuth).toBe('Bearer test-token-123');
  });

  it('skips Bearer token for /auth/login and /auth/register', async () => {
    setStoredToken('existing-token');
    let loginAuth: string | null = null;
    let registerAuth: string | null = null;

    apiClient.defaults.adapter = async (config) => {
      const headers = config.headers as AxiosHeaders;
      if (config.url?.includes('/auth/login')) {
        loginAuth = (headers?.get?.('Authorization') as string) || null;
      } else if (config.url?.includes('/auth/register')) {
        registerAuth = (headers?.get?.('Authorization') as string) || null;
      }
      return {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await apiClient.post('/auth/login', { email: 'a@b.com', password: '123' });
    await apiClient.post('/auth/register', { email: 'a@b.com', password: '123' });

    expect(loginAuth).toBeNull();
    expect(registerAuth).toBeNull();
  });

  it('handles 401 on protected endpoint: clears token and triggers unauthorized callback', async () => {
    const currentToken = 'active-session-token';
    setStoredToken(currentToken);

    const unauthorizedCallback = vi.fn();
    setUnauthorizedHandler(unauthorizedCallback);

    apiClient.defaults.adapter = async (config) => {
      return Promise.reject({
        response: {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          data: { success: false, code: 'UNAUTHORIZED' },
        },
        config,
      });
    };

    await expect(apiClient.get('/admin/users')).rejects.toBeDefined();

    expect(getStoredToken()).toBeNull();
    expect(unauthorizedCallback).toHaveBeenCalledWith('sessionExpired');
  });

  it('does NOT clear token or trigger callback on 401 from /auth/login', async () => {
    setStoredToken('some-token');
    const unauthorizedCallback = vi.fn();
    setUnauthorizedHandler(unauthorizedCallback);

    apiClient.defaults.adapter = async (config) => {
      return Promise.reject({
        response: {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          data: { success: false, code: 'INVALID_CREDENTIALS' },
        },
        config,
      });
    };

    await expect(
      apiClient.post('/auth/login', { email: 'test@b.com', password: 'bad' }),
    ).rejects.toBeDefined();

    expect(unauthorizedCallback).not.toHaveBeenCalled();
    expect(getStoredToken()).toBe('some-token');
  });

  it('does NOT clear token or trigger callback on 403 Forbidden', async () => {
    const currentToken = 'customer-token';
    setStoredToken(currentToken);
    const unauthorizedCallback = vi.fn();
    setUnauthorizedHandler(unauthorizedCallback);

    apiClient.defaults.adapter = async (config) => {
      return Promise.reject({
        response: {
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          data: { success: false, code: 'FORBIDDEN' },
        },
        config,
      });
    };

    await expect(apiClient.get('/admin/reports')).rejects.toBeDefined();

    expect(unauthorizedCallback).not.toHaveBeenCalled();
    expect(getStoredToken()).toBe(currentToken);
  });

  it('stale 401 from old token does not clear newly set token', async () => {
    const oldToken = 'old-expired-token';
    const newToken = 'brand-new-fresh-token';

    // Current token in storage is already the new one
    setStoredToken(newToken);
    const unauthorizedCallback = vi.fn();
    setUnauthorizedHandler(unauthorizedCallback);

    // Simulate an error config where the old request sent the old token
    const oldHeaders = new AxiosHeaders();
    oldHeaders.set('Authorization', `Bearer ${oldToken}`);

    apiClient.defaults.adapter = async (config) => {
      return Promise.reject({
        response: {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          data: { success: false, code: 'UNAUTHORIZED' },
        },
        config: {
          ...config,
          headers: oldHeaders,
        },
      });
    };

    await expect(apiClient.get('/bookings/history')).rejects.toBeDefined();

    // New token must NOT be cleared
    expect(getStoredToken()).toBe(newToken);
    expect(unauthorizedCallback).not.toHaveBeenCalled();
  });
});
