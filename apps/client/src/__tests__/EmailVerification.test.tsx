import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { VerifyEmailPage } from '../pages/VerifyEmailPage';
import { EmailVerificationNotice } from '../components/auth/EmailVerificationNotice';
import { authApi } from '../services/auth.api';
import { apiClient } from '../services/api';
import { AuthProvider } from '../context/AuthContext';
import { AuthContext } from '../context/auth-context-base';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';

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
  clearLocalSession: vi.fn(),
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
    const invalidContainer = screen.getByTestId('verify-email-invalid');
    expect(invalidContainer).toBeInTheDocument();
    expect(invalidContainer.firstElementChild).toHaveClass(
      'bg-status-cancelled-bg',
      'border-status-cancelled-border',
      'text-status-cancelled',
    );
    expect(screen.getByText('Liên kết không hợp lệ')).toBeInTheDocument();

    // With short token
    renderVerifyEmailPage(['/verify-email?token=too-short']);
    expect(screen.getAllByTestId('verify-email-invalid').length).toBeGreaterThan(0);
  });

  it('renders confirmation card with confirm button when token is valid', () => {
    renderVerifyEmailPage([`/verify-email?token=${validToken}`]);

    const confirmContainer = screen.getByTestId('verify-email-confirm');
    expect(confirmContainer).toBeInTheDocument();
    expect(confirmContainer.firstElementChild).toHaveClass(
      'bg-status-confirmed-bg',
      'border-status-confirmed-border',
      'text-status-confirmed',
    );
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
    const successContainer = await screen.findByTestId('verify-email-success');
    expect(successContainer).toBeInTheDocument();
    expect(successContainer.firstElementChild).toHaveClass(
      'bg-status-success-bg',
      'border-status-success-border',
      'text-status-success',
    );
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

  it('keeps user on /verify-email and preserves token when stored JWT is revoked and /me returns 401 (CWB-119)', async () => {
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      createMockJwt({ sub: 'revoked-user', role: 'CUSTOMER' }),
    );
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

    vi.mocked(authApi.verifyEmail).mockResolvedValueOnce({
      success: true,
      message: 'Xác thực email thành công.',
      data: null,
    });

    const LocationProbe = () => {
      const location = useLocation();
      return <output data-testid="verify-location">{location.pathname + location.search}</output>;
    };

    try {
      render(
        <MemoryRouter initialEntries={[`/verify-email?token=${validToken}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/login" element={<div>Login Page</div>} />
            </Routes>
            <LocationProbe />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      });

      expect(screen.getByTestId('verify-location')).toHaveTextContent(/^\/verify-email$/);
      expect(screen.getByTestId('verify-email-confirm')).toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(screen.getByTestId('verify-email-confirm-btn'));

      expect(authApi.verifyEmail).toHaveBeenCalledWith(validToken);
      expect(await screen.findByTestId('verify-email-success')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Đăng nhập ngay' })).toHaveAttribute(
        'href',
        '/login',
      );
    } finally {
      localStorage.clear();
      apiClient.defaults.adapter = originalAdapter;
    }
  });
});

describe('EmailVerificationNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, description and resend button', () => {
    render(<EmailVerificationNotice />);
    const notice = screen.getByTestId('email-verification-notice');
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveClass(
      'bg-status-warning-bg',
      'border-status-warning-border',
      'text-status-warning',
    );
    const descriptionEl = notice.querySelector('[data-slot="alert-description"]');
    expect(descriptionEl).toHaveClass('text-status-warning');
    expect(descriptionEl).not.toHaveClass('text-muted-foreground');
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
