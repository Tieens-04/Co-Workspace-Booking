import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VerifyEmailPage } from '../pages/VerifyEmailPage';
import { EmailVerificationNotice } from '../components/auth/EmailVerificationNotice';
import { authApi } from '../services/auth.api';
import { AuthContext } from '../context/auth-context-base';

vi.mock('../services/auth.api', () => ({
  authApi: {
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
  },
}));

const mockAuthContextValue = {
  token: null,
  isAuthenticated: false,
  principal: null,
  login: vi.fn(),
  logout: vi.fn(),
  applyProfile: vi.fn(),
  refreshProfile: vi.fn().mockResolvedValue(undefined),
  isLoading: false,
  sessionExpired: false,
  clearSessionExpiredNotice: vi.fn(),
};

describe('VerifyEmailPage', () => {
  const validToken = '1234567890123456789012345678901234567890123'; // 43 chars base64url

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderVerifyEmailPage = (initialEntries = [`/verify-email?token=${validToken}`]) => {
    return render(
      <AuthContext.Provider value={mockAuthContextValue}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/rooms" element={<div>Rooms Page</div>} />
            <Route path="/login" element={<div>Login Page</div>} />
            <Route path="/account" element={<div>Account Page</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  };

  it('renders invalid token view when token is missing or malformed', () => {
    renderVerifyEmailPage(['/verify-email']);
    expect(screen.getByTestId('verify-email-invalid')).toBeInTheDocument();
    expect(screen.getByText('Liên kết không hợp lệ')).toBeInTheDocument();

    // With short token
    renderVerifyEmailPage(['/verify-email?token=too-short']);
    expect(screen.getAllByTestId('verify-email-invalid').length).toBeGreaterThan(0);
  });

  it('renders confirmation card with confirm button when token is valid', () => {
    renderVerifyEmailPage([`/verify-email?token=${validToken}`]);

    expect(screen.getByTestId('verify-email-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('verify-email-confirm-btn')).toBeInTheDocument();
    expect(screen.getByText('Hoàn tất xác thực email')).toBeInTheDocument();
  });

  it('submits verification token on confirm click and shows success state', async () => {
    vi.mocked(authApi.verifyEmail).mockResolvedValueOnce({
      success: true,
      message: 'Xác thực email thành công.',
      data: null,
    });

    renderVerifyEmailPage([`/verify-email?token=${validToken}`]);
    const user = userEvent.setup();

    const confirmBtn = screen.getByTestId('verify-email-confirm-btn');
    await user.click(confirmBtn);

    expect(authApi.verifyEmail).toHaveBeenCalledWith(validToken);
    expect(await screen.findByTestId('verify-email-success')).toBeInTheDocument();
    expect(screen.getByText('Xác thực email thành công!')).toBeInTheDocument();
  });

  it('displays error message when verifyEmail API fails', async () => {
    vi.mocked(authApi.verifyEmail).mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          code: 'INVALID_VERIFICATION_TOKEN',
          message: 'Liên kết xác thực không hợp lệ hoặc đã hết hạn.',
        },
      },
    });

    renderVerifyEmailPage([`/verify-email?token=${validToken}`]);
    const user = userEvent.setup();

    const confirmBtn = screen.getByTestId('verify-email-confirm-btn');
    await user.click(confirmBtn);

    expect(authApi.verifyEmail).toHaveBeenCalledWith(validToken);
    expect(
      await screen.findByText('Liên kết xác thực không hợp lệ hoặc đã hết hạn.'),
    ).toBeInTheDocument();
  });
});

describe('EmailVerificationNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, description and resend button', () => {
    render(<EmailVerificationNotice />);
    expect(screen.getByTestId('email-verification-notice')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản chưa xác thực email')).toBeInTheDocument();
    expect(screen.getByTestId('resend-verification-btn')).toBeInTheDocument();
  });

  it('calls authApi.resendVerification and displays success text', async () => {
    vi.mocked(authApi.resendVerification).mockResolvedValueOnce({
      success: true,
      message: 'Đã gửi email xác thực. Vui lòng kiểm tra hộp thư.',
      data: null,
    });

    render(<EmailVerificationNotice />);
    const user = userEvent.setup();

    const btn = screen.getByTestId('resend-verification-btn');
    await user.click(btn);

    expect(authApi.resendVerification).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('resend-success-text')).toBeInTheDocument();
    expect(
      screen.getByText('Đã gửi email xác thực. Vui lòng kiểm tra hộp thư.'),
    ).toBeInTheDocument();
  });

  it('handles rate limit or error from authApi.resendVerification', async () => {
    vi.mocked(authApi.resendVerification).mockRejectedValueOnce({
      response: {
        status: 429,
        data: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Bạn đã yêu cầu gửi email xác thực quá nhiều lần.',
        },
      },
    });

    render(<EmailVerificationNotice />);
    const user = userEvent.setup();

    const btn = screen.getByTestId('resend-verification-btn');
    await user.click(btn);

    expect(authApi.resendVerification).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('resend-error-text')).toBeInTheDocument();
    expect(
      screen.getByText('Bạn đã yêu cầu gửi email xác thực quá nhiều lần.'),
    ).toBeInTheDocument();
  });
});
