import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import { RegisterPage } from '../pages/RegisterPage';
import { authApi } from '../services/auth.api';

// Mock authApi
vi.mock('../services/auth.api', () => ({
  authApi: {
    register: vi.fn(),
  },
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (initialEntries = ['/register']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<div>Mock Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('renders all form fields, labels, and submit button', () => {
    renderComponent();

    expect(screen.getByLabelText(/Họ và tên/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Số điện thoại/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mật khẩu/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Xác nhận mật khẩu/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Đăng ký$/i })).toBeInTheDocument();
  });

  it('validates required fields and display error messages on empty submit', async () => {
    renderComponent();
    const user = userEvent.setup();

    const submitBtn = screen.getByRole('button', { name: /^Đăng ký$/i });
    await user.click(submitBtn);

    expect(await screen.findByText('Họ và tên không được để trống')).toBeInTheDocument();
    expect(screen.getByText('Email không đúng định dạng')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu phải có ít nhất 8 ký tự')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('validates password mismatch', async () => {
    renderComponent();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Họ và tên/i), 'Nguyen Van A');
    await user.type(screen.getByLabelText(/^Email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'Password123');
    await user.type(screen.getByLabelText(/^Xác nhận mật khẩu/i), 'DifferentPassword');

    await user.click(screen.getByRole('button', { name: /^Đăng ký$/i }));

    expect(await screen.findByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('rejects passwords exceeding 72 UTF-8 bytes', async () => {
    renderComponent();
    const user = userEvent.setup();

    // 19 emojis = 19 * 4 = 76 bytes > 72 bytes
    const longUnicodePassword = '🔒'.repeat(19);

    await user.type(screen.getByLabelText(/Họ và tên/i), 'Nguyen Van A');
    await user.type(screen.getByLabelText(/^Email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), longUnicodePassword);
    await user.type(screen.getByLabelText(/^Xác nhận mật khẩu/i), longUnicodePassword);

    await user.click(screen.getByRole('button', { name: /^Đăng ký$/i }));

    expect(await screen.findByText('Mật khẩu không được vượt quá 72 bytes')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('submits valid data strictly without confirmPassword or role, then navigates to /login', async () => {
    const mockRegister = vi.mocked(authApi.register).mockResolvedValueOnce({
      success: true,
      message: 'Đăng ký tài khoản thành công',
      data: {
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Nguyen Van A',
        phoneNumber: '0912345678',
        role: 'CUSTOMER',
      },
    });

    renderComponent();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Họ và tên/i), '  Nguyen Van A  ');
    await user.type(screen.getByLabelText(/^Email/i), '  Test@Example.COM  ');
    await user.type(screen.getByLabelText(/Số điện thoại/i), '  0912345678  ');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'SecurePass123!');
    await user.type(screen.getByLabelText(/^Xác nhận mật khẩu/i), 'SecurePass123!');

    await user.click(screen.getByRole('button', { name: /^Đăng ký$/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1);
    });

    const calledPayload = mockRegister.mock.calls[0][0];
    expect(calledPayload).toEqual({
      fullName: 'Nguyen Van A',
      email: 'test@example.com',
      phoneNumber: '0912345678',
      password: 'SecurePass123!',
    });

    // Ensure strictly no confirmPassword and no role
    expect(calledPayload).not.toHaveProperty('confirmPassword');
    expect(calledPayload).not.toHaveProperty('role');

    // Should navigate to /login
    expect(await screen.findByText('Mock Login Page')).toBeInTheDocument();
  });

  it('maps backend 409 EMAIL_ALREADY_EXISTS error to email field and preserves form data', async () => {
    const headers = new AxiosHeaders();
    const axiosError = new AxiosError(
      'Request failed with status code 409',
      '409',
      { headers } as never,
      {},
      {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: { headers } as never,
        data: {
          success: false,
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Email đã được sử dụng',
        },
      },
    );

    vi.mocked(authApi.register).mockRejectedValueOnce(axiosError);

    renderComponent();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Họ và tên/i), 'Nguyen Van A');
    await user.type(screen.getByLabelText(/^Email/i), 'existing@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'Password123');
    await user.type(screen.getByLabelText(/^Xác nhận mật khẩu/i), 'Password123');

    await user.click(screen.getByRole('button', { name: /^Đăng ký$/i }));

    expect((await screen.findAllByText('Email đã được sử dụng')).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('Email đã được sử dụng', { selector: '.field-error' }),
    ).toBeInTheDocument();

    // Verify form values are preserved
    expect(screen.getByLabelText(/Họ và tên/i)).toHaveValue('Nguyen Van A');
    expect(screen.getByLabelText(/^Email/i)).toHaveValue('existing@example.com');
  });

  it('maps backend 400 VALIDATION_ERROR field errors properly', async () => {
    const headers = new AxiosHeaders();
    const axiosError = new AxiosError(
      'Request failed with status code 400',
      '400',
      { headers } as never,
      {},
      {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: { headers } as never,
        data: {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu đầu vào không hợp lệ',
          details: [
            { field: 'email', message: 'Email không đúng định dạng từ máy chủ' },
            { field: 'fullName', message: 'Họ tên quá dài từ máy chủ' },
          ],
        },
      },
    );

    vi.mocked(authApi.register).mockRejectedValueOnce(axiosError);

    renderComponent();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Họ và tên/i), 'Nguyen Van A');
    await user.type(screen.getByLabelText(/^Email/i), 'valid@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'Password123');
    await user.type(screen.getByLabelText(/^Xác nhận mật khẩu/i), 'Password123');

    await user.click(screen.getByRole('button', { name: /^Đăng ký$/i }));

    expect(await screen.findByText('Email không đúng định dạng từ máy chủ')).toBeInTheDocument();
    expect(screen.getByText('Họ tên quá dài từ máy chủ')).toBeInTheDocument();
  });

  it('prevents double submission by disabling the submit button during submission', async () => {
    let resolvePromise: (val: unknown) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(authApi.register).mockReturnValueOnce(pendingPromise as never);

    renderComponent();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Họ và tên/i), 'Nguyen Van A');
    await user.type(screen.getByLabelText(/^Email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/i), 'Password123');
    await user.type(screen.getByLabelText(/^Xác nhận mật khẩu/i), 'Password123');

    const submitBtn = screen.getByRole('button', { name: /^Đăng ký$/i });
    await user.click(submitBtn);

    expect(screen.getByRole('button', { name: /Đang tạo tài khoản.../i })).toBeDisabled();
    expect(authApi.register).toHaveBeenCalledTimes(1);

    // Try clicking again while disabled
    await user.click(submitBtn);
    expect(authApi.register).toHaveBeenCalledTimes(1);

    // Resolve
    resolvePromise({
      success: true,
      message: 'OK',
      data: {
        id: '1',
        email: 'test@example.com',
        fullName: 'A',
        phoneNumber: null,
        role: 'CUSTOMER',
      },
    });
  });

  it('toggles password and confirm password visibility', async () => {
    renderComponent();
    const user = userEvent.setup();

    const passwordInput = screen.getByLabelText(/^Mật khẩu/i);
    const confirmInput = screen.getByLabelText(/^Xác nhận mật khẩu/i);

    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(confirmInput).toHaveAttribute('type', 'password');

    const togglePassBtn = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    const toggleConfirmBtn = screen.getByRole('button', { name: 'Hiện mật khẩu nhập lại' });

    await user.click(togglePassBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(toggleConfirmBtn);
    expect(confirmInput).toHaveAttribute('type', 'text');

    await user.click(togglePassBtn);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
