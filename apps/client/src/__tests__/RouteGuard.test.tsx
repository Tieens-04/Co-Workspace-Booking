import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { GuestRoute, AdminRoute } from '../components/RouteGuard';
import { NotFoundPage } from '../pages/NotFoundPage';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';

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
                  <div>Login Screen</div>
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

  it('renders 404 NotFoundPage for undefined routes', () => {
    renderWithRoutes('/some-random-unknown-route');

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Không tìm thấy trang')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Về trang chủ/i })).toBeInTheDocument();
  });
});
