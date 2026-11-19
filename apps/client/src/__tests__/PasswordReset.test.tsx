import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { GuestRoute } from '../components/RouteGuard';
import { AuthProvider } from '../context/AuthContext';
import { authApi } from '../services/auth.api';
import { apiClient } from '../services/api';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';

vi.mock('../services/auth.api', () => ({
  authApi: { forgotPassword: vi.fn(), resetPassword: vi.fn(), login: vi.fn(), register: vi.fn() },
}));

const TOKEN = 'A'.repeat(20) + '_' + 'b'.repeat(22);
const GENERIC =
  'Nếu email đã đăng ký, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<p>Trang đăng nhập</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );

describe('Password reset pages (CWB-64)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the server generic confirmation after requesting a link', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.forgotPassword).mockResolvedValue({
      success: true,
      message: GENERIC,
      data: null,
    });
    renderAt('/forgot-password');

    await user.type(screen.getByLabelText('Email'), ' lan@example.com ');
    await user.click(screen.getByRole('button', { name: 'Gửi liên kết đặt lại' }));

    expect(authApi.forgotPassword).toHaveBeenCalledWith('lan@example.com');
    expect(await screen.findByTestId('forgot-password-sent')).toHaveTextContent(GENERIC);
  });

  it('validates the email before calling the API', async () => {
    const user = userEvent.setup();
    renderAt('/forgot-password');

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Gửi liên kết đặt lại' }));

    expect(screen.getByText('Email không đúng định dạng')).toBeInTheDocument();
    expect(authApi.forgotPassword).not.toHaveBeenCalled();
  });

  it('removes the token from the URL, resets the password and offers login', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.resetPassword).mockResolvedValue({
      success: true,
      message: 'OK',
      data: null,
    });
    renderAt(`/reset-password?token=${TOKEN}`);

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/reset-password$/);
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'BrandNew456!');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'BrandNew456!');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(authApi.resetPassword).toHaveBeenCalledWith(TOKEN, 'BrandNew456!');
    expect(await screen.findByTestId('reset-password-done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
  });

  it('shows the server error for an expired or used link', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.resetPassword).mockRejectedValue({
      response: {
        status: 400,
        data: {
          code: 'INVALID_RESET_TOKEN',
          message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
        },
      },
    });
    renderAt(`/reset-password?token=${TOKEN}`);

    await user.type(screen.getByLabelText('Mật khẩu mới'), 'BrandNew456!');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'BrandNew456!');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await screen.findByText(/không hợp lệ hoặc đã hết hạn/)).toBeInTheDocument();
  });

  it('rejects a mismatched confirmation without calling the API', async () => {
    const user = userEvent.setup();
    renderAt(`/reset-password?token=${TOKEN}`);

    await user.type(screen.getByLabelText('Mật khẩu mới'), 'BrandNew456!');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'Different456!');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(screen.getByText('Mật khẩu xác nhận không khớp.')).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it.each(['/reset-password', '/reset-password?token=short'])(
    'shows an invalid-link state for %s',
    (path) => {
      renderAt(path);
      expect(screen.getByTestId('reset-password-invalid-link')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Gửi lại liên kết' })).toHaveAttribute(
        'href',
        '/forgot-password',
      );
    },
  );

  it('clears local session silently when an authenticated user resets their password so "Đăng nhập" reaches /login without GuestRoute bounce (CWB-119)', async () => {
    const token = createMockJwt({ sub: 'cust-1', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => ({
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: {
        success: true,
        message: 'OK',
        data: {
          id: 'cust-1',
          email: 'cust@example.com',
          fullName: 'Cust',
          phoneNumber: null,
          role: 'CUSTOMER',
          emailVerifiedAt: '2026-10-25T00:00:00.000Z',
        },
      },
    });
    vi.mocked(authApi.resetPassword).mockResolvedValueOnce({
      success: true,
      message: 'OK',
      data: null,
    });

    const user = userEvent.setup();
    try {
      render(
        <MemoryRouter initialEntries={[`/reset-password?token=${TOKEN}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<p>Trang chủ</p>} />
              <Route
                path="/login"
                element={
                  <GuestRoute>
                    <p>Trang đăng nhập</p>
                  </GuestRoute>
                }
              />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
            <LocationProbe />
          </AuthProvider>
        </MemoryRouter>,
      );

      await user.type(screen.getByLabelText('Mật khẩu mới'), 'BrandNew456!');
      await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'BrandNew456!');
      await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

      expect(await screen.findByTestId('reset-password-done')).toBeInTheDocument();
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/reset-password$/);

      await user.click(screen.getByRole('link', { name: 'Đăng nhập' }));
      expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/login$/);
    } finally {
      localStorage.clear();
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('shows "Về trang tài khoản" (/account) on ForgotPasswordPage when authenticated and "Quay lại đăng nhập" (/login) for guests (CWB-119)', async () => {
    const guestRender = renderAt('/forgot-password');
    expect(screen.getByRole('link', { name: 'Quay lại đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
    guestRender.unmount();

    const token = createMockJwt({ sub: 'cust-1', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    const originalAdapter = apiClient.defaults.adapter;
    let meCalled = false;
    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/me') {
        meCalled = true;
      }
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: {
          success: true,
          message: 'OK',
          data: {
            id: 'cust-1',
            email: 'cust@example.com',
            fullName: 'Cust',
            phoneNumber: null,
            role: 'CUSTOMER',
            emailVerifiedAt: '2026-10-25T00:00:00.000Z',
          },
        },
      };
    };

    try {
      render(
        <MemoryRouter initialEntries={['/forgot-password']}>
          <AuthProvider>
            <Routes>
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/account" element={<p>Trang tài khoản</p>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(meCalled).toBe(true);
      });
      expect(screen.getByRole('link', { name: 'Về trang tài khoản' })).toHaveAttribute(
        'href',
        '/account',
      );
      expect(screen.queryByRole('link', { name: 'Quay lại đăng nhập' })).not.toBeInTheDocument();
    } finally {
      localStorage.clear();
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('clears revoked JWT silently on /forgot-password when GET /me returns 401 and switches footer link to /login (CWB-119)', async () => {
    const revokedToken = createMockJwt({ sub: 'cust-revoked', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, revokedToken);
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
      render(
        <MemoryRouter initialEntries={['/forgot-password']}>
          <AuthProvider>
            <Routes>
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/login" element={<p>Trang đăng nhập</p>} />
              <Route path="/account" element={<p>Trang tài khoản</p>} />
            </Routes>
            <LocationProbe />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      });
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/forgot-password$/);
      expect(screen.getByRole('link', { name: 'Quay lại đăng nhập' })).toHaveAttribute(
        'href',
        '/login',
      );
      expect(screen.queryByRole('link', { name: 'Về trang tài khoản' })).not.toBeInTheDocument();
    } finally {
      localStorage.clear();
      apiClient.defaults.adapter = originalAdapter;
    }
  });
});
