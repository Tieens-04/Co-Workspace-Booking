import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { AdminRoute, AuthenticatedRoute, CustomerRoute } from '../components/RouteGuard';
import { useAuth } from '../hooks/useAuth';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';
import { apiClient } from '../services/api';

const TestAuthConsumer = () => {
  const { isAuthenticated, principal, token, sessionExpired, login, logout, clearLocalSession } =
    useAuth();

  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? 'AUTHENTICATED' : 'UNAUTHENTICATED'}</div>
      <div data-testid="principal-id">{principal?.id || 'NONE'}</div>
      <div data-testid="principal-role">{principal?.role || 'NONE'}</div>
      <div data-testid="token-value">{token || 'NONE'}</div>
      <div data-testid="session-expired">{sessionExpired ? 'EXPIRED' : 'ACTIVE'}</div>

      <button
        onClick={() =>
          login(createMockJwt({ sub: 'user-new', role: 'CUSTOMER' }), {
            id: 'user-new',
            email: 'new@example.com',
            fullName: 'New User',
            phoneNumber: null,
            role: 'CUSTOMER',
            emailVerifiedAt: '2026-10-25T00:00:00.000Z',
          })
        }
      >
        Trigger Login
      </button>

      <button onClick={() => logout('userAction')}>Trigger Logout</button>
      <button onClick={() => clearLocalSession()}>Trigger Clear Local Session</button>
      <button onClick={() => void apiClient.get('/protected').catch(() => undefined)}>
        Trigger Protected Request
      </button>
    </div>
  );
};

const LocationProbe = () => {
  const location = useLocation();
  const state = location.state as { from?: string; sessionExpired?: boolean } | null;
  return (
    <div>
      <div data-testid="current-path">{location.pathname + location.search}</div>
      <div data-testid="location-from">{state?.from ?? 'NONE'}</div>
      <div data-testid="location-session-expired">{state?.sessionExpired ? 'TRUE' : 'FALSE'}</div>
    </div>
  );
};

const renderAuthContext = (
  initialEntry: string | { pathname: string; search?: string; state?: unknown } = '/',
) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <TestAuthConsumer />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  );

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes as unauthenticated when localStorage is empty', () => {
    renderAuthContext();

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(screen.getByTestId('principal-id')).toHaveTextContent('NONE');
    expect(screen.getByTestId('token-value')).toHaveTextContent('NONE');
  });

  it('restores valid session from localStorage on reload', () => {
    const validToken = createMockJwt({ sub: 'persisted-user', role: 'ADMIN' });
    localStorage.setItem(TOKEN_STORAGE_KEY, validToken);

    renderAuthContext();

    expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
    expect(screen.getByTestId('principal-id')).toHaveTextContent('persisted-user');
    expect(screen.getByTestId('principal-role')).toHaveTextContent('ADMIN');
    expect(screen.getByTestId('token-value')).toHaveTextContent(validToken);
  });

  it('clears corrupted or malformed token on init', () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'invalid.corrupted.token');

    renderAuthContext();

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('clears expired token on init', () => {
    // Expired 100 seconds ago
    const expiredToken = createMockJwt({
      sub: 'expired-user',
      role: 'CUSTOMER',
      exp: Math.floor(Date.now() / 1000) - 100,
    });
    localStorage.setItem(TOKEN_STORAGE_KEY, expiredToken);

    renderAuthContext();

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('login updates localStorage and state, logout clears them', async () => {
    const user = userEvent.setup();

    renderAuthContext();

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');

    await user.click(screen.getByText('Trigger Login'));

    expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
    expect(screen.getByTestId('principal-id')).toHaveTextContent('user-new');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).not.toBeNull();

    await user.click(screen.getByText('Trigger Logout'));

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
  });

  it('synchronizes logout across tabs via storage event on protected routes without keeping from', () => {
    const validToken = createMockJwt({ sub: 'tab-user', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, validToken);

    renderAuthContext('/bookings?view=UPCOMING');

    expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');

    // Simulate another tab clearing the token
    act(() => {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: TOKEN_STORAGE_KEY,
          oldValue: validToken,
          newValue: null,
        }),
      );
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
    expect(screen.getByTestId('location-from')).toHaveTextContent('NONE');
    expect(screen.getByTestId('location-session-expired')).toHaveTextContent('FALSE');
  });

  it('clears local session silently on cross-tab logout when user is on a public route (CWB-119)', () => {
    const validToken = createMockJwt({ sub: 'tab-user', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, validToken);

    renderAuthContext('/reset-password');

    act(() => {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: TOKEN_STORAGE_KEY,
          oldValue: validToken,
          newValue: null,
        }),
      );
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(screen.getByTestId('session-expired')).toHaveTextContent('ACTIVE');
    expect(screen.getByTestId('current-path')).toHaveTextContent('/reset-password');
  });

  it('ignores a stale cross-tab logout event after a newer token has been stored', () => {
    const oldToken = createMockJwt({ sub: 'old-tab-user', role: 'CUSTOMER' });
    const newToken = createMockJwt({ sub: 'new-tab-user', role: 'ADMIN' });
    localStorage.setItem(TOKEN_STORAGE_KEY, oldToken);
    renderAuthContext();

    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: TOKEN_STORAGE_KEY,
          oldValue: oldToken,
          newValue: null,
        }),
      );
    });

    expect(screen.getByTestId('current-path')).toHaveTextContent('/');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(newToken);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: TOKEN_STORAGE_KEY,
          oldValue: null,
          newValue: newToken,
        }),
      );
    });

    expect(screen.getByTestId('principal-id')).toHaveTextContent('new-tab-user');
    expect(screen.getByTestId('principal-role')).toHaveTextContent('ADMIN');
  });

  it('does not redirect a guest when another tab removes an already absent token', () => {
    renderAuthContext('/register');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: TOKEN_STORAGE_KEY,
          oldValue: null,
          newValue: null,
        }),
      );
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(screen.getByTestId('current-path')).toHaveTextContent('/register');
  });

  it('redirects to login with sessionExpired and state.from after a non-/me protected API returns 401 on a public route', async () => {
    const token = createMockJwt({ sub: 'api-user', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/me') {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            success: true,
            message: 'OK',
            data: {
              id: 'api-user',
              email: 'api@example.com',
              fullName: 'API User',
              phoneNumber: null,
              role: 'CUSTOMER',
              emailVerifiedAt: '2026-10-25T00:00:00.000Z',
            },
          },
        };
      }
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

    try {
      renderAuthContext('/rooms/room-1?date=2026-11-20');
      const user = userEvent.setup();
      await user.click(screen.getByText('Trigger Protected Request'));

      await waitFor(() => {
        expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
      });
      expect(screen.getByTestId('session-expired')).toHaveTextContent('EXPIRED');
      expect(screen.getByTestId('location-session-expired')).toHaveTextContent('TRUE');
      expect(screen.getByTestId('location-from')).toHaveTextContent(
        '/rooms/room-1?date=2026-11-20',
      );
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it.each([
    '/',
    '/rooms/room-1?capacity=4',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
  ])(
    'silently clears local session without redirecting when GET /me returns 401 on public route %s (CWB-119)',
    async (publicPath) => {
      const token = createMockJwt({ sub: 'revoked-user', role: 'CUSTOMER' });
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      const originalAdapter = apiClient.defaults.adapter;
      apiClient.defaults.adapter = async (config) =>
        Promise.reject({
          response: {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            data: { success: false, code: 'UNAUTHORIZED' },
          },
          config,
        });

      try {
        renderAuthContext(publicPath);

        await waitFor(() => {
          expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
        });
        expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
        expect(screen.getByTestId('session-expired')).toHaveTextContent('ACTIVE');
        expect(screen.getByTestId('current-path')).toHaveTextContent(publicPath);
      } finally {
        apiClient.defaults.adapter = originalAdapter;
      }
    },
  );

  it.each(['/bookings?view=UPCOMING', '/account', '/admin/bookings?page=2'])(
    'redirects to /login with sessionExpired and state.from when GET /me returns 401 on protected route %s (CWB-119)',
    async (protectedPath) => {
      const token = createMockJwt({ sub: 'revoked-user', role: 'CUSTOMER' });
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      const originalAdapter = apiClient.defaults.adapter;
      apiClient.defaults.adapter = async (config) =>
        Promise.reject({
          response: {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            data: { success: false, code: 'UNAUTHORIZED' },
          },
          config,
        });

      try {
        renderAuthContext(protectedPath);

        await waitFor(() => {
          expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
        });
        expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
        expect(screen.getByTestId('session-expired')).toHaveTextContent('EXPIRED');
        expect(screen.getByTestId('location-session-expired')).toHaveTextContent('TRUE');
        expect(screen.getByTestId('location-from')).toHaveTextContent(protectedPath);
      } finally {
        apiClient.defaults.adapter = originalAdapter;
      }
    },
  );

  it('automatically logs out and preserves state.from when token expires via timer on a protected route', () => {
    vi.useFakeTimers();

    // Expires in 5 seconds
    const expSeconds = Math.floor(Date.now() / 1000) + 5;
    const token = createMockJwt({ sub: 'timer-user', role: 'CUSTOMER', exp: expSeconds });
    localStorage.setItem(TOKEN_STORAGE_KEY, token);

    renderAuthContext('/bookings?view=UPCOMING');

    expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');

    // Fast-forward 6 seconds
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(screen.getByTestId('session-expired')).toHaveTextContent('EXPIRED');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
    expect(screen.getByTestId('location-from')).toHaveTextContent('/bookings?view=UPCOMING');
  });

  it('silently clears local session when token expires via timer on a public route (CWB-119)', () => {
    vi.useFakeTimers();

    const expSeconds = Math.floor(Date.now() / 1000) + 5;
    const token = createMockJwt({ sub: 'timer-user', role: 'CUSTOMER', exp: expSeconds });
    localStorage.setItem(TOKEN_STORAGE_KEY, token);

    renderAuthContext('/reset-password');

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(screen.getByTestId('session-expired')).toHaveTextContent('ACTIVE');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/reset-password');
  });

  it('keeps a valid long-lived token active without overflowing the browser timer', () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(window, 'setTimeout');

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const token = createMockJwt({
      sub: 'long-session-user',
      role: 'CUSTOMER',
      exp: Math.floor((Date.now() + thirtyDaysMs) / 1000),
    });
    localStorage.setItem(TOKEN_STORAGE_KEY, token);

    renderAuthContext('/bookings');

    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2_147_483_647);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(token);

    act(() => {
      vi.advanceTimersByTime(2_147_483_647 - 1000);
    });
    expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');

    act(() => {
      vi.advanceTimersByTime(thirtyDaysMs - 2_147_483_647 + 1000);
    });
    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
  });

  it('clears state.from on explicit userAction logout and keeps path on clearLocalSession (CWB-119)', async () => {
    const validToken = createMockJwt({ sub: 'admin-1', role: 'ADMIN' });
    localStorage.setItem(TOKEN_STORAGE_KEY, validToken);

    const { unmount } = renderAuthContext('/admin/bookings?page=2');
    const user = userEvent.setup();

    await user.click(screen.getByText('Trigger Clear Local Session'));
    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(screen.getByTestId('current-path')).toHaveTextContent('/admin/bookings?page=2');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    unmount();

    localStorage.setItem(TOKEN_STORAGE_KEY, validToken);
    renderAuthContext('/admin/bookings?page=2');
    await user.click(screen.getByText('Trigger Logout'));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
    expect(screen.getByTestId('location-from')).toHaveTextContent('NONE');
    expect(screen.getByTestId('location-session-expired')).toHaveTextContent('FALSE');
  });

  describe('Guarded Routes Synchronization (CWB-119 R02 Regression)', () => {
    const renderGuardedAuth = (initialEntry: string) =>
      render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<div>Home Screen</div>} />
              <Route path="/login" element={<LocationProbe />} />
              <Route
                path="/bookings"
                element={
                  <CustomerRoute>
                    <TestAuthConsumer />
                  </CustomerRoute>
                }
              />
              <Route
                path="/account"
                element={
                  <AuthenticatedRoute>
                    <TestAuthConsumer />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/admin/bookings"
                element={
                  <AdminRoute>
                    <TestAuthConsumer />
                  </AdminRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

    it('clears state.from on userAction logout and cross-tab storage removal inside CustomerRoute and AdminRoute', async () => {
      const customerToken = createMockJwt({ sub: 'cust-guard', role: 'CUSTOMER' });
      localStorage.setItem(TOKEN_STORAGE_KEY, customerToken);

      const user = userEvent.setup();
      const first = renderGuardedAuth('/bookings?view=UPCOMING');
      await user.click(screen.getByText('Trigger Logout'));

      await waitFor(() => {
        expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
      });
      expect(screen.getByTestId('location-from')).toHaveTextContent('NONE');
      expect(screen.getByTestId('location-session-expired')).toHaveTextContent('FALSE');
      first.unmount();

      const adminToken = createMockJwt({ sub: 'admin-guard', role: 'ADMIN' });
      localStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
      renderGuardedAuth('/admin/bookings?page=2');

      act(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: TOKEN_STORAGE_KEY,
            oldValue: adminToken,
            newValue: null,
          }),
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
      });
      expect(screen.getByTestId('location-from')).toHaveTextContent('NONE');
      expect(screen.getByTestId('location-session-expired')).toHaveTextContent('FALSE');
    });

    it('preserves both sessionExpired=true and state.from when GET /me 401 or exp timer fires inside CustomerRoute and AuthenticatedRoute', async () => {
      const customerToken = createMockJwt({ sub: 'cust-401', role: 'CUSTOMER' });
      localStorage.setItem(TOKEN_STORAGE_KEY, customerToken);
      const originalAdapter = apiClient.defaults.adapter;
      apiClient.defaults.adapter = async (config) =>
        Promise.reject({
          response: {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            data: { success: false, code: 'UNAUTHORIZED' },
          },
          config,
        });

      try {
        const first = renderGuardedAuth('/bookings?view=UPCOMING');
        await waitFor(() => {
          expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
        });
        expect(screen.getByTestId('location-session-expired')).toHaveTextContent('TRUE');
        expect(screen.getByTestId('location-from')).toHaveTextContent('/bookings?view=UPCOMING');
        first.unmount();
      } finally {
        apiClient.defaults.adapter = originalAdapter;
      }

      vi.useFakeTimers();
      const expSeconds = Math.floor(Date.now() / 1000) + 5;
      const expiringToken = createMockJwt({
        sub: 'cust-timer',
        role: 'CUSTOMER',
        exp: expSeconds,
      });
      localStorage.setItem(TOKEN_STORAGE_KEY, expiringToken);

      renderGuardedAuth('/account?section=security');

      act(() => {
        vi.advanceTimersByTime(6000);
      });

      expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
      expect(screen.getByTestId('location-session-expired')).toHaveTextContent('TRUE');
      expect(screen.getByTestId('location-from')).toHaveTextContent('/account?section=security');
    });

    it('preserves existing state.from when already on /login and never leaks /verify-email?token into state.from on 401', async () => {
      const token = createMockJwt({ sub: 'cust-edge', role: 'CUSTOMER' });
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      const originalAdapter = apiClient.defaults.adapter;
      apiClient.defaults.adapter = async (config) => {
        if (config.url === '/me') {
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            data: {
              success: true,
              message: 'OK',
              data: {
                id: 'cust-edge',
                email: 'edge@example.com',
                fullName: 'Edge User',
                phoneNumber: null,
                role: 'CUSTOMER',
                emailVerifiedAt: '2026-10-25T00:00:00.000Z',
              },
            },
          };
        }
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

      const user = userEvent.setup();
      try {
        const loginMount = renderAuthContext({
          pathname: '/login',
          state: { from: '/bookings?view=UPCOMING' },
        });
        await user.click(screen.getByText('Trigger Protected Request'));
        await waitFor(() => {
          expect(screen.getByTestId('location-session-expired')).toHaveTextContent('TRUE');
        });
        expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
        expect(screen.getByTestId('location-from')).toHaveTextContent('/bookings?view=UPCOMING');
        loginMount.unmount();

        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        renderAuthContext('/verify-email?token=secret-token-value');
        await user.click(screen.getByText('Trigger Protected Request'));
        await waitFor(() => {
          expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
        });
        expect(screen.getByTestId('location-session-expired')).toHaveTextContent('TRUE');
        expect(screen.getByTestId('location-from')).toHaveTextContent('NONE');
      } finally {
        apiClient.defaults.adapter = originalAdapter;
      }
    });
  });
});
