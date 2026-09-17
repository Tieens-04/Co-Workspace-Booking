import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import { LoginPage } from '../pages/LoginPage';
import { AuthProvider } from '../context/AuthContext';
import { authApi } from '../services/auth.api';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';

vi.mock('../services/auth.api', () => ({
  authApi: {
    login: vi.fn(),
  },
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderComponent = (
    initialEntries: (string | { pathname: string; state?: Record<string, unknown> })[] = ['/login'],
  ) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>Mock Home Page</div>} />
            <Route path="/admin" element={<div>Mock Admin Page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  };

  it('renders email, password inputs, submit button, and link to register', () => {
    renderComponent();

    expect(screen.getByLabelText(/^Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mật khẩu/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Đăng nhập$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Đăng ký ngay/i })).toBeInTheDocument();
  });

  it('validates empty inputs on submit', async () => {
    renderComponent();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Đăng nhập$/i }));

    expect(await screen.findByText('Email không đúng định dạng')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu không được để trống')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('prefills email and displays success notification when redirected from register', () => {
    renderComponent([
      {
        pathname: '/login',
        state: {
          email: 'prefilled@example.com',
          successMessage: 'Đăng ký tài khoản thành công! Vui lòng đăng nhập.',
        },
      },
    ]);

    expect(screen.getByLabelText(/^Email/i)).toHaveValue('prefilled@example.com');
    expect(
      screen.getByText('Đăng ký tài khoản thành công! Vui lòng đăng nhập.'),
    ).toBeInTheDocument();
  });

  it('displays session expired alert when redirected with sessionExpired state', () => {
    renderComponent([
      {
        pathname: '/login',
        state: { sessionExpired: true },
      },
    ]);

    expect(
      screen.getByText(/Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại để tiếp tục./i),
    ).toBeInTheDocument();
  });

  it('successful CUSTOMER login saves token and navigates to /', async () => {
    const customerToken = createMockJwt({ sub: 'cust-1', role: 'CUSTOMER' });
    vi.mocked(authApi.login).mockResolvedValueOnce({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        accessToken: customerToken,
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: {
          id: 'cust-1',
          email: 'customer@example.com',
          fullName: 'Customer User',
          phoneNumber: null,
          role: 'CUSTOMER',
        },
      },
    });

    renderComponent();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Email/i), 'customer@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'ValidPassword123');
    await user.click(screen.getByRole('button', { name: /^Đăng nhập$/i }));

    await waitFor(() => {
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(customerToken);
    });

    expect(await screen.findByText('Mock Home Page')).toBeInTheDocument();
  });

  it('successful ADMIN login saves token and navigates to /admin', async () => {
    const adminToken = createMockJwt({ sub: 'admin-1', role: 'ADMIN' });
    vi.mocked(authApi.login).mockResolvedValueOnce({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        accessToken: adminToken,
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: {
          id: 'admin-1',
          email: 'admin@cospace.vn',
          fullName: 'System Administrator',
          phoneNumber: null,
          role: 'ADMIN',
        },
      },
    });

    renderComponent();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Email/i), 'admin@cospace.vn');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'AdminPassword123');
    await user.click(screen.getByRole('button', { name: /^Đăng nhập$/i }));

    await waitFor(() => {
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(adminToken);
    });

    expect(await screen.findByText('Mock Admin Page')).toBeInTheDocument();
  });

  it('stays on login and reports an error when the browser cannot persist the session', async () => {
    const token = createMockJwt({ sub: 'storage-user', role: 'CUSTOMER' });
    vi.mocked(authApi.login).mockResolvedValueOnce({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        accessToken: token,
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: {
          id: 'storage-user',
          email: 'storage@example.com',
          fullName: 'Storage User',
          phoneNumber: null,
          role: 'CUSTOMER',
        },
      },
    });
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });

    renderComponent();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Email/i), 'storage@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'Password123');
    await user.click(screen.getByRole('button', { name: /^Đăng nhập$/i }));

    expect(
      await screen.findByText(/Không thể lưu phiên đăng nhập trên trình duyệt/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Mock Home Page')).not.toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    storageSpy.mockRestore();
  });

  it('displays "Email hoặc mật khẩu không chính xác" on 401 INVALID_CREDENTIALS and preserves input', async () => {
    const headers = new AxiosHeaders();
    const axiosError = new AxiosError(
      'Request failed with status code 401',
      '401',
      { headers } as never,
      {},
      {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: { headers } as never,
        data: {
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Email hoặc mật khẩu không chính xác',
        },
      },
    );

    vi.mocked(authApi.login).mockRejectedValueOnce(axiosError);

    renderComponent();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Email/i), 'wrong@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'WrongPass');
    await user.click(screen.getByRole('button', { name: /^Đăng nhập$/i }));

    expect(await screen.findByText('Email hoặc mật khẩu không chính xác')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/i)).toHaveValue('wrong@example.com');
    expect(screen.getByLabelText(/^Mật khẩu/i)).toHaveValue('WrongPass');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('handles network failure with general error message', async () => {
    const axiosError = new AxiosError('Network Error');
    vi.mocked(authApi.login).mockRejectedValueOnce(axiosError);

    renderComponent();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'Password123');
    await user.click(screen.getByRole('button', { name: /^Đăng nhập$/i }));

    expect(
      await screen.findByText(/Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại./i),
    ).toBeInTheDocument();
  });

  it('prevents double submission while login is in flight', async () => {
    let resolveLogin: (val: unknown) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });

    vi.mocked(authApi.login).mockReturnValueOnce(pendingPromise as never);

    renderComponent();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'Password123');

    const submitBtn = screen.getByRole('button', { name: /^Đăng nhập$/i });
    await user.click(submitBtn);

    expect(screen.getByRole('button', { name: /Đang đăng nhập.../i })).toBeDisabled();
    expect(authApi.login).toHaveBeenCalledTimes(1);

    await user.click(submitBtn);
    expect(authApi.login).toHaveBeenCalledTimes(1);

    resolveLogin({
      success: true,
      message: 'OK',
      data: {
        accessToken: createMockJwt(),
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: {
          id: '1',
          email: 'user@example.com',
          fullName: 'U',
          phoneNumber: null,
          role: 'CUSTOMER',
        },
      },
    });
  });

  it('toggles password visibility', async () => {
    renderComponent();
    const user = userEvent.setup();

    const passwordInput = screen.getByLabelText(/^Mật khẩu/i);
    const toggleBtn = screen.getByRole('button', { name: /Hiện mật khẩu/i });

    expect(passwordInput).toHaveAttribute('type', 'password');
    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: /Ẩn mật khẩu/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
