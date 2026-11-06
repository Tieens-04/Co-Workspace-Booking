import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUsersPage } from '../pages/AdminUsersPage';
import { adminUserApi, AdminUserItem } from '../services/admin-user.api';

const toast = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useToast', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('../services/admin-user.api', () => ({
  adminUserApi: { list: vi.fn(), updateStatus: vi.fn() },
}));

const user = (overrides: Partial<AdminUserItem>): AdminUserItem => ({
  id: 'user-1',
  email: 'an@example.com',
  fullName: 'Nguyễn An',
  phoneNumber: '0901234567',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  lockedAt: null,
  lockReason: null,
  createdAt: '2026-11-01T03:00:00.000Z',
  bookingCount: 7,
  noShowCount: 2,
  upcomingBookingCount: 1,
  lastBookingAt: '2026-11-03T03:00:00.000Z',
  ...overrides,
});
const page = (items: AdminUserItem[]) => ({
  success: true as const,
  message: 'OK',
  data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } },
});

describe('AdminUsersPage (CWB-79)', () => {
  const admin = user({
    id: 'admin-1',
    email: 'admin@example.com',
    fullName: 'Quản trị',
    role: 'ADMIN',
    bookingCount: 0,
    noShowCount: 0,
    upcomingBookingCount: 0,
    lastBookingAt: null,
  });
  const locked = user({
    id: 'user-2',
    email: 'binh@example.com',
    status: 'LOCKED',
    lockedAt: '2026-11-04T03:00:00.000Z',
    lockReason: 'Spam giữ chỗ',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminUserApi.list).mockResolvedValue(page([user({}), locked, admin]));
  });

  it('lists accounts with booking stats and offers lock/unlock only for customers', async () => {
    render(<AdminUsersPage />);

    const row = await screen.findByTestId('user-row-user-1');
    expect(row).toHaveTextContent('Nguyễn An');
    expect(row).toHaveTextContent('an@example.com · 0901234567');
    expect(row).toHaveTextContent('7 lượt đặt · 2 lần không đến · 1 sắp tới');
    expect(row).toHaveTextContent('Đang hoạt động');
    expect(
      within(row).getByRole('button', { name: 'Khóa tài khoản an@example.com' }),
    ).toBeVisible();

    const lockedRow = screen.getByTestId('user-row-user-2');
    expect(lockedRow).toHaveTextContent('Đã khóa');
    expect(lockedRow).toHaveTextContent('Lý do khóa: Spam giữ chỗ');
    expect(within(lockedRow).getByRole('button', { name: /Mở khóa/ })).toBeVisible();

    expect(screen.queryByTestId('user-toggle-admin-1')).not.toBeInTheDocument();
  });

  it('searches with the submitted filters and resets to page 1', async () => {
    const u = userEvent.setup();
    render(<AdminUsersPage />);
    await screen.findByTestId('user-list');

    await u.type(screen.getByLabelText('Email, tên hoặc số điện thoại'), '  0901 ');
    await u.selectOptions(screen.getByLabelText('Trạng thái'), 'LOCKED');
    await u.click(screen.getByTestId('user-apply'));

    await waitFor(() =>
      expect(adminUserApi.list).toHaveBeenLastCalledWith(
        { page: 1, limit: 20, q: '0901', role: undefined, status: 'LOCKED' },
        expect.any(AbortSignal),
      ),
    );
  });

  it('shows empty and error states', async () => {
    vi.mocked(adminUserApi.list).mockResolvedValueOnce(page([]));
    const { unmount } = render(<AdminUsersPage />);
    expect(await screen.findByText('Không có tài khoản phù hợp')).toBeInTheDocument();
    unmount();

    vi.mocked(adminUserApi.list).mockRejectedValueOnce({
      response: { data: { message: 'Máy chủ lỗi' } },
    });
    render(<AdminUsersPage />);
    expect(await screen.findByText('Máy chủ lỗi')).toBeInTheDocument();
    expect(screen.getByTestId('user-reload')).toBeInTheDocument();
  });

  it('requires a reason, warns about upcoming bookings and lists them after locking', async () => {
    const u = userEvent.setup();
    vi.mocked(adminUserApi.updateStatus).mockResolvedValue({
      success: true,
      message: 'OK',
      data: {
        user: user({ status: 'LOCKED', lockReason: 'Nhiều lần không đến' }),
        affectedBookings: [
          {
            id: 'b-1',
            bookingCode: 'CS-20261110-AB12',
            roomName: 'Phòng Sen',
            startTime: '2026-11-10T02:00:00.000Z',
            endTime: '2026-11-10T03:00:00.000Z',
          },
        ],
      },
    });
    render(<AdminUsersPage />);

    await u.click(await screen.findByTestId('user-toggle-user-1'));
    const dialog = await screen.findByTestId('user-status-modal');
    expect(within(dialog).getByTestId('lock-warning')).toHaveTextContent(
      '1 lượt đặt sắp tới sẽ được giữ nguyên, không tự hủy',
    );

    await u.click(within(dialog).getByTestId('user-status-submit'));
    expect(await within(dialog).findByText('Vui lòng nhập lý do')).toBeInTheDocument();
    expect(adminUserApi.updateStatus).not.toHaveBeenCalled();

    await u.type(within(dialog).getByTestId('user-status-reason'), ' Nhiều lần không đến ');
    await u.click(within(dialog).getByTestId('user-status-submit'));

    expect(adminUserApi.updateStatus).toHaveBeenCalledWith(
      'user-1',
      'LOCKED',
      'Nhiều lần không đến',
    );
    const outcome = await screen.findByTestId('lock-outcome');
    expect(outcome).toHaveTextContent('CS-20261110-AB12 · Phòng Sen');
    expect(toast).toHaveBeenCalledWith('Đã khóa tài khoản an@example.com', 'info');
    await waitFor(() => expect(adminUserApi.list).toHaveBeenCalledTimes(2));
  });

  it('keeps the dialog open with the server error when the change is rejected', async () => {
    const u = userEvent.setup();
    vi.mocked(adminUserApi.updateStatus).mockRejectedValue({
      response: { data: { message: 'Tài khoản đang hoạt động' } },
    });
    render(<AdminUsersPage />);

    await u.click(await screen.findByTestId('user-toggle-user-2'));
    const dialog = await screen.findByTestId('user-status-modal');
    expect(within(dialog).queryByTestId('lock-warning')).not.toBeInTheDocument();
    await u.type(within(dialog).getByTestId('user-status-reason'), 'Đã xác minh');
    await u.click(within(dialog).getByTestId('user-status-submit'));

    expect(adminUserApi.updateStatus).toHaveBeenCalledWith('user-2', 'ACTIVE', 'Đã xác minh');
    expect(await within(dialog).findByText('Tài khoản đang hoạt động')).toBeInTheDocument();
  });
});
