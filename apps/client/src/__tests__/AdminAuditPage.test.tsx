import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAuditPage } from '../pages/AdminAuditPage';
import { describeChanges } from '../utils/auditChanges';
import { adminAuditApi, AuditEvent } from '../services/admin-audit.api';

vi.mock('../services/admin-audit.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/admin-audit.api')>()),
  adminAuditApi: { list: vi.fn() },
}));

const payment: AuditEvent = {
  id: 'evt-1',
  actorId: 'admin-1',
  actorRole: 'ADMIN',
  action: 'BOOKING_PAYMENT_CONFIRMED',
  entityType: 'BOOKING',
  entityId: 'booking-1',
  before: { bookingCode: 'CS-20261103-AB12', paymentStatus: 'UNPAID', paymentMethod: null },
  after: { bookingCode: 'CS-20261103-AB12', paymentStatus: 'PAID', paymentMethod: 'CASH' },
  createdAt: '2026-11-03T03:15:00.000Z',
};
const page = (items: AuditEvent[], total = items.length, current = 1) => ({
  success: true as const,
  message: 'OK',
  data: {
    items,
    pagination: { page: current, limit: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) },
  },
});

describe('AdminAuditPage (CWB-67)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAuditApi.list).mockResolvedValue(page([payment]));
  });

  it('lists events with action label, Vietnam time, actor and changed fields only', async () => {
    render(<AdminAuditPage />);

    const row = await screen.findByTestId('audit-row-evt-1');
    expect(row).toHaveTextContent('Xác nhận thanh toán');
    expect(row).toHaveTextContent('2026-11-03 10:15');
    expect(row).toHaveTextContent('admin-1 (ADMIN)');
    expect(row).toHaveTextContent('Thanh toán:UNPAID → PAID');
    expect(row).toHaveTextContent('Phương thức:— → CASH');
    expect(row).not.toHaveTextContent('Mã đặt phòng');
    expect(adminAuditApi.list).toHaveBeenCalledWith({ page: 1, limit: 20 }, expect.anything());
  });

  it('sends selected filters and resets to the first page', async () => {
    const user = userEvent.setup();
    vi.mocked(adminAuditApi.list)
      .mockResolvedValueOnce(page([payment], 45))
      .mockResolvedValue(page([payment], 45, 2));
    render(<AdminAuditPage />);
    await screen.findByTestId('audit-row-evt-1');

    await user.click(screen.getByRole('button', { name: /trang sau|tiếp/i }));
    await waitFor(() =>
      expect(adminAuditApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything(),
      ),
    );

    await user.selectOptions(screen.getByLabelText('Đối tượng'), 'BOOKING');
    await user.selectOptions(screen.getByLabelText('Thao tác'), 'BOOKING_CANCELLED_BY_ADMIN');
    await user.type(screen.getByLabelText('Mã đối tượng (ID)'), '  booking-1 ');
    await user.click(screen.getByTestId('audit-apply'));

    await waitFor(() =>
      expect(adminAuditApi.list).toHaveBeenLastCalledWith(
        {
          page: 1,
          limit: 20,
          entityType: 'BOOKING',
          action: 'BOOKING_CANCELLED_BY_ADMIN',
          entityId: 'booking-1',
        },
        expect.anything(),
      ),
    );
  });

  it('shows empty and retryable error states', async () => {
    const user = userEvent.setup();
    vi.mocked(adminAuditApi.list)
      .mockRejectedValueOnce({ response: { data: { message: 'Lỗi máy chủ' } } })
      .mockResolvedValueOnce(page([]));
    render(<AdminAuditPage />);

    expect(await screen.findByText('Lỗi máy chủ')).toBeInTheDocument();
    await user.click(screen.getByTestId('audit-retry'));
    expect(await screen.findByText('Chưa có thao tác nào')).toBeInTheDocument();
  });

  it('lists every recorded field for a creation event', () => {
    const changes = describeChanges({
      before: null,
      after: { bookingCode: 'CS-20261103-ZZ99', totalAmount: '200.00' },
    });
    expect(changes).toEqual([
      { key: 'bookingCode', label: 'Mã đặt phòng', from: null, to: 'CS-20261103-ZZ99' },
      { key: 'totalAmount', label: 'Tổng tiền', from: null, to: '200.00' },
    ]);
  });

  it('renders CLOSURE audit events with Vietnamese labels and filters by CLOSURE entity (CWB-86)', async () => {
    const user = userEvent.setup();
    const closureCreated: AuditEvent = {
      id: 'evt-closure-1',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
      action: 'CLOSURE_CREATED' as AuditEvent['action'],
      entityType: 'CLOSURE' as AuditEvent['entityType'],
      entityId: 'closure-1',
      before: null,
      after: {
        roomId: null,
        startTime: '2026-12-25T01:00:00.000Z',
        endTime: '2026-12-25T11:00:00.000Z',
        reason: 'Nghỉ Giáng Sinh',
        acknowledgeConflictingBookings: true,
      },
      createdAt: '2026-11-09T03:00:00.000Z',
    };
    vi.mocked(adminAuditApi.list).mockResolvedValue(page([closureCreated]));

    render(<AdminAuditPage />);

    const row = await screen.findByTestId('audit-row-evt-closure-1');
    expect(row).toHaveTextContent('Tạo khung đóng cửa');
    expect(row).toHaveTextContent('Khung đóng cửa');
    expect(row).toHaveTextContent('Lý do:Nghỉ Giáng Sinh');
    expect(row).toHaveTextContent('Xác nhận lịch đặt trùng:Có');

    await user.selectOptions(screen.getByLabelText('Đối tượng'), 'CLOSURE');
    await user.click(screen.getByTestId('audit-apply'));

    await waitFor(() =>
      expect(adminAuditApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ entityType: 'CLOSURE' }),
        expect.anything(),
      ),
    );
  });
});
