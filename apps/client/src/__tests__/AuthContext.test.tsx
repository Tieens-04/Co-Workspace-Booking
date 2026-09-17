import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../hooks/useAuth';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';
import { apiClient } from '../services/api';

const TestAuthConsumer = () => {
  const { isAuthenticated, principal, token, sessionExpired, login, logout } = useAuth();

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
          })
        }
      >
        Trigger Login
      </button>

      <button onClick={() => logout('userAction')}>Trigger Logout</button>
      <button onClick={() => void apiClient.get('/protected').catch(() => undefined)}>
        Trigger Protected Request
      </button>
    </div>
  );
};

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};

const renderAuthContext = (initialEntry = '/') =>
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

  it('synchronizes logout across tabs via storage event', () => {
    const validToken = createMockJwt({ sub: 'tab-user', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, validToken);

    renderAuthContext();

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

  it('redirects to login with an expired session after a protected API returns 401', async () => {
    const token = createMockJwt({ sub: 'api-user', role: 'CUSTOMER' });
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
      renderAuthContext();
      const user = userEvent.setup();
      await user.click(screen.getByText('Trigger Protected Request'));

      await waitFor(() => {
        expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
      });
      expect(screen.getByTestId('session-expired')).toHaveTextContent('EXPIRED');
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('automatically logs out when token expires via timer', () => {
    vi.useFakeTimers();

    // Expires in 5 seconds
    const expSeconds = Math.floor(Date.now() / 1000) + 5;
    const token = createMockJwt({ sub: 'timer-user', role: 'CUSTOMER', exp: expSeconds });
    localStorage.setItem(TOKEN_STORAGE_KEY, token);

    renderAuthContext();

    expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');

    // Fast-forward 6 seconds
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('UNAUTHENTICATED');
    expect(screen.getByTestId('session-expired')).toHaveTextContent('EXPIRED');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
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

    renderAuthContext();

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
});
