import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminEmailsPage } from '../pages/AdminEmailsPage';
import { adminEmailOutboxApi, EmailOutboxItem } from '../services/admin-email-outbox.api';

const toast = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useToast', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('../services/admin-email-outbox.api', () => ({
  adminEmailOutboxApi: { list: vi.fn(), retry: vi.fn() },
}));

const item = (overrides: Partial<EmailOutboxItem>): EmailOutboxItem => ({
  id: 'mail-1',
  kind: 'BOOKING_CONFIRMATION',
  bookingId: 'booking-1',
  bookingCode: 'CS-20261103-AB12',
  status: 'SENT',
  attempts: 1,
  lastError: null,
  nextAttemptAt: '2026-11-03T03:00:00.000Z',
  sentAt: '2026-11-03T03:00:05.000Z',
  createdAt: '2026-11-03T03:00:00.000Z',
  updatedAt: '2026-11-03T03:00:05.000Z',
  ...overrides,
});
const page = (items: EmailOutboxItem[]) => ({
  success: true as const,
  message: 'OK',
  data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } },
});

describe('AdminEmailsPage (CWB-68)', () => {
  const failed = item({
    id: 'mail-2',
    kind: 'BOOKING_CANCELLATION',
    bookingCode: 'CS-20261103-CD34',
    status: 'FAILED',
    attempts: 5,
    lastError: 'SMTP_ERROR',
    sentAt: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminEmailOutboxApi.list).mockResolvedValue(page([item({}), failed]));
  });

  it('shows delivery status and offers retry only for failed or skipped emails', async () => {
    render(<AdminEmailsPage />);

    const sent = await screen.findByTestId('email-row-mail-1');
    expect(sent).toHaveTextContent('Xác nhận đặt phòng · CS-20261103-AB12');
    expect(sent).toHaveTextContent('Đã gửi');
    expect(sent).toHaveTextContent('Gửi lúc 2026-11-03 10:00');
    expect(screen.queryByTestId('email-retry-mail-1')).not.toBeInTheDocument();

    const row = screen.getByTestId('email-row-mail-2');
    expect(row).toHaveTextContent('Gửi thất bại');
    expect(row).toHaveTextContent('5 lần thử');
    expect(row).toHaveTextContent('Lỗi máy chủ email');
    expect(screen.getByTestId('email-retry-mail-2')).toBeInTheDocument();
  });

  it('labels reminder emails and their skip reasons (CWB-80)', async () => {
    vi.mocked(adminEmailOutboxApi.list).mockResolvedValue(
      page([
        item({
          id: 'mail-3',
          kind: 'BOOKING_REMINDER',
          status: 'SKIPPED',
          lastError: 'REMINDER_EXPIRED',
          sentAt: null,
        }),
      ]),
    );
    render(<AdminEmailsPage />);

    const row = await screen.findByTestId('email-row-mail-3');
    expect(row).toHaveTextContent('Nhắc lịch · CS-20261103-AB12');
    expect(row).toHaveTextContent('Đã qua giờ bắt đầu');
    expect(screen.getByTestId('email-retry-mail-3')).toBeInTheDocument();
  });

  it('requeues a failed email, confirms with a toast and reloads', async () => {
    const user = userEvent.setup();
    vi.mocked(adminEmailOutboxApi.retry).mockResolvedValue({
      success: true,
      message: 'OK',
      data: { ...failed, status: 'QUEUED', attempts: 0, lastError: null },
    });
    render(<AdminEmailsPage />);

    await user.click(await screen.findByTestId('email-retry-mail-2'));
    expect(adminEmailOutboxApi.retry).toHaveBeenCalledWith('mail-2');
    await waitFor(() => expect(adminEmailOutboxApi.list).toHaveBeenCalledTimes(2));
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('CS-20261103-CD34'), 'success');
  });

  it('shows the server error when retry is rejected', async () => {
    const user = userEvent.setup();
    vi.mocked(adminEmailOutboxApi.retry).mockRejectedValue({
      response: { data: { message: 'Chỉ có thể gửi lại email ở trạng thái FAILED hoặc SKIPPED' } },
    });
    render(<AdminEmailsPage />);

    await user.click(await screen.findByTestId('email-retry-mail-2'));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('FAILED hoặc SKIPPED'), 'error'),
    );
  });

  it('filters by status from the first page and handles empty/error states', async () => {
    const user = userEvent.setup();
    vi.mocked(adminEmailOutboxApi.list)
      .mockResolvedValueOnce(page([item({})]))
      .mockResolvedValueOnce(page([]))
      .mockRejectedValueOnce({ response: { data: { message: 'Lỗi máy chủ' } } })
      .mockResolvedValue(page([]));
    render(<AdminEmailsPage />);
    await screen.findByTestId('email-row-mail-1');

    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'FAILED');
    await waitFor(() =>
      expect(adminEmailOutboxApi.list).toHaveBeenLastCalledWith(
        { page: 1, limit: 20, status: 'FAILED' },
        expect.anything(),
      ),
    );
    expect(await screen.findByText('Chưa có email nào')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'SKIPPED');
    expect(await screen.findByText('Lỗi máy chủ')).toBeInTheDocument();
    await user.click(screen.getByTestId('email-reload'));
    expect(await screen.findByText('Chưa có email nào')).toBeInTheDocument();
  });
});
