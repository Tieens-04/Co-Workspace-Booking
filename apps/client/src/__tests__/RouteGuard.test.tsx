import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import {
  GuestRoute,
  AdminRoute,
  CustomerRoute,
  AuthenticatedRoute,
} from '../components/RouteGuard';
import App from '../App';
import { AuthLayout } from '../layouts/AuthLayout';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { apiClient } from '../services/api';
import { roomApi } from '../services/room.api';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';

const LoginLocationProbe = () => {
  const location = useLocation();
  const state = location.state as { from?: string } | null;
  return (
    <div>
      <div>Login Screen</div>
      <div data-testid="login-from-state">{state?.from ?? 'NONE'}</div>
    </div>
  );
};

describe('RouteGuard and Navigation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderWithRoutes = (initialEntry: string) => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<div>Home Screen</div>} />
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <LoginLocationProbe />
                </GuestRoute>
              }
            />
            <Route
              path="/register"
              element={
                <GuestRoute>
                  <div>Register Screen</div>
                </GuestRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <div>Admin Secret Screen</div>
                </AdminRoute>
              }
            />
            <Route
              path="/admin/bookings"
              element={
                <AdminRoute>
                  <div>Admin Bookings Screen</div>
                </AdminRoute>
              }
            />
            <Route
              path="/customer-only"
              element={
                <CustomerRoute>
                  <div>Customer Secret Screen</div>
                </CustomerRoute>
              }
            />
            <Route
              path="/bookings"
              element={
                <CustomerRoute>
                  <div>Booking History Screen</div>
                </CustomerRoute>
              }
            />
            <Route
              path="/account"
              element={
                <AuthenticatedRoute>
                  <div>Account Screen</div>
                </AuthenticatedRoute>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  };

  it('redirects unauthenticated user from /admin to /login', () => {
    renderWithRoutes('/admin');

    expect(screen.getByText('Login Screen')).toBeInTheDocument();
    expect(screen.queryByText('Admin Secret Screen')).not.toBeInTheDocument();
  });

  it('shows 403 Forbidden screen when CUSTOMER visits /admin without redirecting or logging out', () => {
    const customerToken = createMockJwt({ sub: 'c-1', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, customerToken);

    renderWithRoutes('/admin');

    expect(screen.getByText('403 - Không có quyền truy cập')).toBeInTheDocument();
    expect(
      screen.getByText(/Trang này chỉ dành riêng cho Quản trị viên \(ADMIN\)/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Admin Secret Screen')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument();

    // Still logged in
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(customerToken);
  });

  it('allows ADMIN to access /admin', () => {
    const adminToken = createMockJwt({ sub: 'a-1', role: 'ADMIN' });
    localStorage.setItem(TOKEN_STORAGE_KEY, adminToken);

    renderWithRoutes('/admin');

    expect(screen.getByText('Admin Secret Screen')).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /admin/bookings to /login', () => {
    renderWithRoutes('/admin/bookings');

    expect(screen.getByText('Login Screen')).toBeInTheDocument();
    expect(screen.queryByText('Admin Bookings Screen')).not.toBeInTheDocument();
  });

  it('shows 403 Forbidden screen when CUSTOMER visits /admin/bookings without redirecting or logging out', () => {
    const customerToken = createMockJwt({ sub: 'c-1', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, customerToken);

    renderWithRoutes('/admin/bookings');

    expect(screen.getByText('403 - Không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByText('Admin Bookings Screen')).not.toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(customerToken);
  });

  it('allows ADMIN to access /admin/bookings', () => {
    const adminToken = createMockJwt({ sub: 'a-1', role: 'ADMIN' });
    localStorage.setItem(TOKEN_STORAGE_KEY, adminToken);

    renderWithRoutes('/admin/bookings');

    expect(screen.getByText('Admin Bookings Screen')).toBeInTheDocument();
  });

  it('redirects authenticated CUSTOMER from /login to /', () => {
    const customerToken = createMockJwt({ sub: 'c-1', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, customerToken);

    renderWithRoutes('/login');

    expect(screen.getByText('Home Screen')).toBeInTheDocument();
    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument();
  });

  it('redirects authenticated ADMIN from /login to /admin', () => {
    const adminToken = createMockJwt({ sub: 'a-1', role: 'ADMIN' });
    localStorage.setItem(TOKEN_STORAGE_KEY, adminToken);

    renderWithRoutes('/login');

    expect(screen.getByText('Admin Secret Screen')).toBeInTheDocument();
    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument();
  });

  describe('CustomerRoute', () => {
    it('redirects unauthenticated user from customer route to /login', () => {
      renderWithRoutes('/customer-only');

      expect(screen.getByText('Login Screen')).toBeInTheDocument();
      expect(screen.queryByText('Customer Secret Screen')).not.toBeInTheDocument();
    });

    it('redirects ADMIN from customer route to /', () => {
      const adminToken = createMockJwt({ sub: 'a-1', role: 'ADMIN' });
      localStorage.setItem(TOKEN_STORAGE_KEY, adminToken);

      renderWithRoutes('/customer-only');

      expect(screen.getByText('Home Screen')).toBeInTheDocument();
      expect(screen.queryByText('Customer Secret Screen')).not.toBeInTheDocument();
    });

    it('allows authenticated CUSTOMER to access customer route', () => {
      const customerToken = createMockJwt({ sub: 'c-1', role: 'CUSTOMER' });
      localStorage.setItem(TOKEN_STORAGE_KEY, customerToken);

      renderWithRoutes('/customer-only');

      expect(screen.getByText('Customer Secret Screen')).toBeInTheDocument();
    });

    it('sanitizes window.history.state when redirecting unauthenticated user', () => {
      window.history.replaceState({ idx: 1, key: 'k1', usr: { booking: { id: 'b1' } } }, '');
      renderWithRoutes('/customer-only');

      expect(window.history.state).toEqual({
        idx: 1,
        key: 'k1',
        usr: null,
      });
      expect(window.history.state.usr).toBeNull();
    });

    it('redirects unauthenticated user from /bookings and /bookings/:id to /login', () => {
      const { unmount } = render(
        <MemoryRouter initialEntries={['/bookings']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<div>Login Screen</div>} />
              <Route
                path="/bookings"
                element={
                  <CustomerRoute>
                    <div>Booking History Screen</div>
                  </CustomerRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );
      expect(screen.getByText('Login Screen')).toBeInTheDocument();
      expect(screen.queryByText('Booking History Screen')).not.toBeInTheDocument();
      unmount();

      render(
        <MemoryRouter initialEntries={['/bookings/11111111-1111-4111-8111-111111111111']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<div>Login Screen</div>} />
              <Route
                path="/bookings/:id"
                element={
                  <CustomerRoute>
                    <div>Booking Detail Screen</div>
                  </CustomerRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );
      expect(screen.getByText('Login Screen')).toBeInTheDocument();
      expect(screen.queryByText('Booking Detail Screen')).not.toBeInTheDocument();
    });
  });

  it('renders 404 NotFoundPage for undefined routes', () => {
    renderWithRoutes('/some-random-unknown-route');

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Không tìm thấy trang')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Về trang chủ/i })).toBeInTheDocument();
  });

  it('404 page offers a way forward to the home page and the room explorer', () => {
    renderWithRoutes('/khong-ton-tai');

    expect(screen.getByRole('link', { name: /Về trang chủ/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Khám phá phòng/i })).toHaveAttribute('href', '/rooms');
  });

  it('403 card keeps role="alert" and links back to the home page and the room explorer', () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'c-1', role: 'CUSTOMER' }));

    renderWithRoutes('/admin');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('403 - Không có quyền truy cập');
    expect(screen.getByRole('link', { name: /Về trang chủ/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Khám phá phòng/i })).toHaveAttribute('href', '/rooms');
  });

  describe('Deep-link state.from preservation (CWB-119)', () => {
    it('preserves pathname and search in state.from when CustomerRoute redirects to /login', () => {
      renderWithRoutes('/bookings?view=UPCOMING&page=2');

      expect(screen.getByText('Login Screen')).toBeInTheDocument();
      expect(screen.getByTestId('login-from-state')).toHaveTextContent(
        '/bookings?view=UPCOMING&page=2',
      );
    });

    it('preserves pathname and search and sanitizes history state when AdminRoute redirects to /login', () => {
      window.history.replaceState({ idx: 2, key: 'adm-k', usr: { bookingCode: 'CS-1' } }, '');
      renderWithRoutes('/admin/bookings?status=CONFIRMED&page=2');

      expect(screen.getByText('Login Screen')).toBeInTheDocument();
      expect(screen.getByTestId('login-from-state')).toHaveTextContent(
        '/admin/bookings?status=CONFIRMED&page=2',
      );
      expect(window.history.state).toEqual({
        idx: 2,
        key: 'adm-k',
        usr: null,
      });
    });

    it('preserves pathname and search when AuthenticatedRoute redirects to /login and allows CUSTOMER or ADMIN', () => {
      const { unmount } = renderWithRoutes('/account?section=security');

      expect(screen.getByText('Login Screen')).toBeInTheDocument();
      expect(screen.getByTestId('login-from-state')).toHaveTextContent('/account?section=security');
      unmount();

      localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'c-1', role: 'CUSTOMER' }));
      const customerRender = renderWithRoutes('/account');
      expect(screen.getByText('Account Screen')).toBeInTheDocument();
      customerRender.unmount();

      localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'a-1', role: 'ADMIN' }));
      renderWithRoutes('/account');
      expect(screen.getByText('Account Screen')).toBeInTheDocument();
    });
  });

  describe('AuthLayout route accessibility for signed-in users (CWB-119)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const renderAuthShellRoutes = (initialEntry: string) => {
      vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
        success: true,
        message: 'OK',
        data: { items: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } },
      });

      return render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<div>Home Screen</div>} />
              <Route path="/admin" element={<div>Admin Secret Screen</div>} />
              <Route element={<AuthLayout />}>
                <Route
                  element={
                    <GuestRoute>
                      <Outlet />
                    </GuestRoute>
                  }
                >
                  <Route path="/login" element={<div>Login Screen</div>} />
                  <Route path="/register" element={<div>Register Screen</div>} />
                </Route>
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );
    };

    it.each(['CUSTOMER', 'ADMIN'] as const)(
      'allows signed-in %s to open /forgot-password and /reset-password inside AuthLayout while still redirecting /login and /register',
      (role) => {
        const token = createMockJwt({ sub: `u-${role}`, role });
        const resetToken = 'A'.repeat(20) + '_' + 'b'.repeat(22);

        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        const forgotRender = renderAuthShellRoutes('/forgot-password');
        expect(screen.getByRole('heading', { name: 'Quên mật khẩu' })).toBeInTheDocument();
        expect(screen.getByTestId('auth-visual')).toBeInTheDocument();
        forgotRender.unmount();

        const resetRender = renderAuthShellRoutes(`/reset-password?token=${resetToken}`);
        expect(screen.getByRole('heading', { name: 'Đặt lại mật khẩu' })).toBeInTheDocument();
        expect(screen.getByTestId('auth-visual')).toBeInTheDocument();
        resetRender.unmount();

        const loginRender = renderAuthShellRoutes('/login');
        expect(
          screen.getByText(role === 'ADMIN' ? 'Admin Secret Screen' : 'Home Screen'),
        ).toBeInTheDocument();
        loginRender.unmount();

        const registerRender = renderAuthShellRoutes('/register');
        expect(
          screen.getByText(role === 'ADMIN' ? 'Admin Secret Screen' : 'Home Screen'),
        ).toBeInTheDocument();
        registerRender.unmount();
      },
    );

    it('renders App routes /forgot-password and /reset-password inside AuthLayout for signed-in users without GuestRoute redirect', async () => {
      const resetToken = 'A'.repeat(20) + '_' + 'b'.repeat(22);
      const token = createMockJwt({ sub: 'cust-app', role: 'CUSTOMER' });
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
                id: 'cust-app',
                email: 'cust@example.com',
                fullName: 'Cust',
                phoneNumber: null,
                role: 'CUSTOMER',
                emailVerifiedAt: '2026-10-25T00:00:00.000Z',
              },
            },
          };
        }
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            success: true,
            message: 'OK',
            data: { items: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } },
          },
        };
      };

      try {
        window.history.pushState({}, '', '/forgot-password');
        const forgotApp = render(<App />);
        expect(await screen.findByRole('heading', { name: 'Quên mật khẩu' })).toBeInTheDocument();
        expect(screen.getByTestId('auth-visual')).toBeInTheDocument();
        expect(window.location.pathname).toBe('/forgot-password');
        forgotApp.unmount();

        window.history.pushState({}, '', `/reset-password?token=${resetToken}`);
        const resetApp = render(<App />);
        expect(
          await screen.findByRole('heading', { name: 'Đặt lại mật khẩu' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('auth-visual')).toBeInTheDocument();
        expect(window.location.pathname).toBe('/reset-password');
        resetApp.unmount();
      } finally {
        window.history.pushState({}, '', '/');
        apiClient.defaults.adapter = originalAdapter;
      }
    });
  });
});
