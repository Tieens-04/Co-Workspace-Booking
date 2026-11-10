import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AccountPage } from '../pages/AccountPage';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../hooks/useAuth';
import { meApi } from '../services/me.api';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';
import type { SafeUser } from '../types/auth';

vi.mock('../services/me.api', () => ({
  meApi: { getMe: vi.fn(), updateMe: vi.fn(), changePassword: vi.fn(), logoutAll: vi.fn() },
}));

const user: SafeUser = {
  id: 'customer-1',
  email: 'lan@example.com',
  fullName: 'Nguyễn Thu Lan',
  phoneNumber: '0901234567',
  role: 'CUSTOMER',
  emailVerifiedAt: '2026-10-25T00:00:00.000Z',
};
const ok = <T,>(data: T) => ({ success: true as const, message: 'OK', data });

function Greeting() {
  const { principal } = useAuth();
  return <p data-testid="greeting">{principal?.fullName ?? '(chưa có tên)'}</p>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/account']}>
      <AuthProvider>
        <Greeting />
        <Routes>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/login" element={<p data-testid="login-screen">Đăng nhập</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

describe('AccountPage and profile hydration (CWB-63)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // A restored session: the token only carries id/role, like after a page refresh.
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      createMockJwt({ sub: user.id, role: 'CUSTOMER', exp: Math.floor(Date.now() / 1000) + 3600 }),
    );
    vi.mocked(meApi.getMe).mockResolvedValue(ok(user));
  });

  it('restores the display name after refresh and fills the profile form from the API', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Nguyễn Thu Lan')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0901234567')).toBeInTheDocument();
    expect(screen.getByText('lan@example.com')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('greeting')).toHaveTextContent('Nguyễn Thu Lan'));
  });

  it('shows a retryable error when the profile cannot be loaded', async () => {
    const user$ = userEvent.setup();
    vi.mocked(meApi.getMe)
      .mockRejectedValueOnce({ response: { status: 500, data: { message: 'Máy chủ lỗi' } } })
      .mockRejectedValueOnce({ response: { status: 500, data: { message: 'Máy chủ lỗi' } } })
      .mockResolvedValue(ok(user));
    renderPage();

    expect(await screen.findByTestId('account-load-error')).toHaveTextContent('Máy chủ lỗi');
    await user$.click(screen.getByTestId('account-retry'));
    expect(await screen.findByDisplayValue('Nguyễn Thu Lan')).toBeInTheDocument();
  });

  it('saves name/phone and updates the greeting without reloading', async () => {
    const user$ = userEvent.setup();
    vi.mocked(meApi.updateMe).mockResolvedValue(
      ok({ ...user, fullName: 'Lan Nguyễn', phoneNumber: null }),
    );
    renderPage();

    const name = await screen.findByLabelText('Họ và tên');
    await user$.clear(name);
    await user$.type(name, 'Lan Nguyễn');
    await user$.clear(screen.getByLabelText('Số điện thoại'));
    await user$.click(screen.getByRole('button', { name: 'Lưu thông tin' }));

    expect(meApi.updateMe).toHaveBeenCalledWith({ fullName: 'Lan Nguyễn', phoneNumber: '' });
    expect(await screen.findByText('Đã lưu thay đổi.')).toBeInTheDocument();
    expect(screen.getByTestId('greeting')).toHaveTextContent('Lan Nguyễn');
  });

  it('blocks an empty name client-side and surfaces server validation errors', async () => {
    const user$ = userEvent.setup();
    renderPage();

    await user$.clear(await screen.findByLabelText('Họ và tên'));
    await user$.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    expect(screen.getByTestId('account-profile-error')).toHaveTextContent('không được để trống');
    expect(meApi.updateMe).not.toHaveBeenCalled();
  });

  it('validates phone number format client-side, surfaces inline error, and has inputMode="tel" (CWB-74)', async () => {
    const user$ = userEvent.setup();
    renderPage();

    const phoneInput = await screen.findByLabelText('Số điện thoại');
    expect(phoneInput).toHaveAttribute('inputMode', 'tel');

    await user$.clear(phoneInput);
    await user$.type(phoneInput, 'abc');
    await user$.click(screen.getByRole('button', { name: 'Lưu thông tin' }));

    expect(await screen.findByText('Số điện thoại không đúng định dạng')).toBeInTheDocument();
    expect(meApi.updateMe).not.toHaveBeenCalled();

    // Verify punctuation-only input is rejected
    await user$.clear(phoneInput);
    await user$.type(phoneInput, '- .');
    await user$.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    expect(await screen.findByText('Số điện thoại không đúng định dạng')).toBeInTheDocument();
    expect(meApi.updateMe).not.toHaveBeenCalled();
  });

  it('changes the password and continues the session with the new token', async () => {
    const user$ = userEvent.setup();
    const newToken = createMockJwt({
      sub: user.id,
      role: 'CUSTOMER',
      exp: Math.floor(Date.now() / 1000) + 7200,
    });
    vi.mocked(meApi.changePassword).mockResolvedValue(
      ok({ accessToken: newToken, tokenType: 'Bearer' as const, expiresIn: 7200, user }),
    );
    renderPage();

    await user$.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'Password123!');
    await user$.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassword456!');
    await user$.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'NewPassword456!');
    await user$.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(meApi.changePassword).toHaveBeenCalledWith({
      currentPassword: 'Password123!',
      newPassword: 'NewPassword456!',
    });
    expect(await screen.findByText('Mật khẩu đã được đổi.')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(newToken);
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveValue('');
  });

  it('keeps the session and shows the error when the current password is wrong', async () => {
    const user$ = userEvent.setup();
    const original = localStorage.getItem(TOKEN_STORAGE_KEY);
    vi.mocked(meApi.changePassword).mockRejectedValue({
      response: {
        status: 400,
        data: { code: 'INVALID_CURRENT_PASSWORD', message: 'Mật khẩu hiện tại không chính xác' },
      },
    });
    renderPage();

    await user$.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'Wrong123!');
    await user$.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassword456!');
    await user$.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'NewPassword456!');
    await user$.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByTestId('account-password-error')).toHaveTextContent(
      'Mật khẩu hiện tại không chính xác',
    );
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(original);
  });

  it('validates confirmation mismatch before calling the API', async () => {
    const user$ = userEvent.setup();
    renderPage();

    await user$.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'Password123!');
    await user$.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassword456!');
    await user$.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'Different456!');
    await user$.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(screen.getByTestId('account-password-error')).toHaveTextContent('không khớp');
    expect(meApi.changePassword).not.toHaveBeenCalled();
  });
  describe('log out everywhere (CWB-77)', () => {
    const openDialog = async (user$: ReturnType<typeof userEvent.setup>) => {
      await user$.click(await screen.findByTestId('account-logout-all-btn'));
      return screen.findByTestId('account-logout-all-dialog');
    };

    it('asks for confirmation, revokes all sessions and ends this one', async () => {
      const user$ = userEvent.setup();
      vi.mocked(meApi.logoutAll).mockResolvedValue(ok(null));
      renderPage();

      const dialog = await openDialog(user$);
      expect(dialog).toHaveTextContent('kể cả phiên hiện tại');
      expect(meApi.logoutAll).not.toHaveBeenCalled();
      await user$.click(screen.getByTestId('account-logout-all-confirm'));

      expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
      expect(meApi.logoutAll).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      expect(screen.getByTestId('greeting')).toHaveTextContent('(chưa có tên)');
    });

    it('does nothing when the confirmation is cancelled', async () => {
      const user$ = userEvent.setup();
      const original = localStorage.getItem(TOKEN_STORAGE_KEY);
      renderPage();

      await openDialog(user$);
      await user$.click(screen.getByRole('button', { name: 'Hủy' }));

      await waitFor(() =>
        expect(screen.queryByTestId('account-logout-all-dialog')).not.toBeInTheDocument(),
      );
      expect(meApi.logoutAll).not.toHaveBeenCalled();
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(original);
    });

    it('keeps the session and shows the server error inside the dialog on failure', async () => {
      const user$ = userEvent.setup();
      const original = localStorage.getItem(TOKEN_STORAGE_KEY);
      vi.mocked(meApi.logoutAll).mockRejectedValue({
        response: { status: 500, data: { message: 'Máy chủ lỗi' } },
      });
      renderPage();

      await openDialog(user$);
      await user$.click(screen.getByTestId('account-logout-all-confirm'));

      expect(await screen.findByTestId('account-logout-all-error')).toHaveTextContent(
        'Máy chủ lỗi',
      );
      expect(screen.getByTestId('account-logout-all-confirm')).toBeEnabled();
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(original);
      expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument();
    });
  });
});
