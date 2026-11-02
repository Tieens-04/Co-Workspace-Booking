import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { authApi } from '../services/auth.api';

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
});
