import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminBookingsPage } from '../pages/AdminBookingsPage';
import { adminBookingApi } from '../services/admin-booking.api';
import { roomApi } from '../services/room.api';
import { AdminBookingItem } from '../types/admin-booking';
import { RoomAvailabilitySlot } from '../types/room';
import { formatVnDateTimeLocal } from '../utils/bookingTime';

const create48Slots = (dateStr: string): RoomAvailabilitySlot[] => {
  const slots: RoomAvailabilitySlot[] = [];
  const startOfDay = new Date(`${dateStr}T00:00:00.000+07:00`);
  for (let i = 0; i < 48; i++) {
    const slotStart = new Date(startOfDay.getTime() + i * 30 * 60 * 1000);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
    slots.push({
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString(),
      status: 'AVAILABLE',
    });
  }
  return slots;
};

const getFutureSlot = (hoursAhead = 3, durationHours = 2) => {
  const base = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  base.setUTCMinutes(0, 0, 0);
  const start = new Date(base.getTime());
  const end = new Date(base.getTime() + durationHours * 60 * 60 * 1000);
  return {
    startTime: formatVnDateTimeLocal(start),
    endTime: formatVnDateTimeLocal(end),
    startDate: start,
    endDate: end,
  };
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    principal: {
      id: 'admin-uuid-1',
      email: 'admin@cospace.com',
      fullName: 'System Admin',
      role: 'ADMIN',
    },
    logout: vi.fn(),
  }),
}));

vi.mock('../services/admin-booking.api', () => ({
  adminBookingApi: {
    getBookings: vi.fn(),
    createGuestBooking: vi.fn(),
    confirmPayment: vi.fn(),
    cancelBooking: vi.fn(),
    completeBooking: vi.fn(),
    markNoShow: vi.fn(),
    getRevenue: vi.fn(),
  },
}));

vi.mock('../services/room.api', () => ({
  roomApi: {
    getRooms: vi.fn(),
    getAvailability: vi.fn(),
  },
}));

const mockBookingsList: AdminBookingItem[] = [
  {
    id: 'booking-1',
    bookingCode: 'CS-20261003-USER',
    room: {
      id: 'room-1',
      name: 'Phòng Hội Thảo A',
    },
    startTime: '2026-10-03T02:00:00.000Z',
    endTime: '2026-10-03T04:00:00.000Z',
    totalAmount: '400000.00',
    note: 'Yêu cầu micro không dây',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    paymentMethod: 'QR',
    customer: {
      kind: 'USER',
      name: 'Trần Văn Khách',
      phone: '0901234567',
    },
  },
  {
    id: 'booking-2',
    bookingCode: 'CS-20261003-GUEST',
    room: {
      id: 'room-2',
      name: 'Phòng Họp Nhóm B',
    },
    startTime: '2026-10-03T07:00:00.000Z',
    endTime: '2026-10-03T09:00:00.000Z',
    totalAmount: '300000.00',
    note: null,
    status: 'COMPLETED',
    paymentStatus: 'UNPAID',
    paymentMethod: null,
    customer: {
      kind: 'GUEST',
      name: 'Lê Vãng Lai',
      phone: '0988776655',
    },
  },
];

const mockBookingsResponse = (
  items: AdminBookingItem[] = mockBookingsList,
  total = 2,
  totalPages = 1,
  page = 1,
) => ({
  success: true,
  message: 'Thành công',
  data: {
    items,
    pagination: {
      page,
      limit: 10,
      total,
      totalPages,
    },
  },
});

describe('AdminBookingsPage - Booking Management & Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminBookingApi.getBookings).mockResolvedValue(mockBookingsResponse());
    vi.mocked(adminBookingApi.getRevenue).mockResolvedValue({
      success: true,
      message: 'Lấy dữ liệu doanh thu thành công',
      data: {
        actualRevenue: '500000.00',
        potentialRevenue: '800000.00',
        unpaidRevenue: '300000.00',
        totalBookings: 2,
        paidBookings: 1,
        unpaidBookings: 1,
        cancelledBookings: 0,
        period: {
          startDate: null,
          endDate: null,
        },
      },
    });
    vi.mocked(adminBookingApi.completeBooking).mockResolvedValue({
      success: true,
      message: 'Đã hoàn tất ca sử dụng thành công',
      data: {
        ...mockBookingsList[0],
        status: 'COMPLETED',
      },
    });
    vi.mocked(adminBookingApi.markNoShow).mockResolvedValue({
      success: true,
      message: 'Đã đánh dấu khách không đến thành công',
      data: {
        ...mockBookingsList[0],
        status: 'NO_SHOW',
      },
    });
    vi.mocked(roomApi.getRooms).mockResolvedValue({
      success: true,
      message: 'OK',
      data: {
        items: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
      },
    });
  });

  const renderComponent = (initialPath = '/admin/bookings') => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <AdminBookingsPage />
      </MemoryRouter>,
    );
  };

  it('renders loading state and displays list of bookings with customer kind indicators', async () => {
    renderComponent();

    expect(screen.getByTestId('admin-bookings-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('CS-20261003-USER')).toBeInTheDocument();
    });

    expect(screen.getByText('CS-20261003-GUEST')).toBeInTheDocument();
    expect(screen.getByText('Trần Văn Khách')).toBeInTheDocument();
    expect(screen.getByText('Lê Vãng Lai')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản')).toBeInTheDocument();
    expect(screen.getByText('Vãng lai')).toBeInTheDocument();
    expect(screen.getByText('Phòng Hội Thảo A')).toBeInTheDocument();
    expect(screen.getByText('Phòng Họp Nhóm B')).toBeInTheDocument();
    expect(screen.getByTestId('total-bookings-count')).toHaveTextContent('(2 đơn)');
  });

  it('renders empty state when no bookings match filter criteria', async () => {
    vi.mocked(adminBookingApi.getBookings).mockResolvedValueOnce(mockBookingsResponse([], 0, 0, 1));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('admin-bookings-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('Không tìm thấy đơn đặt phòng')).toBeInTheDocument();
  });

  it('renders error state and retries on button click', async () => {
    vi.mocked(adminBookingApi.getBookings).mockRejectedValueOnce(new Error('Network failure'));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('admin-bookings-error')).toBeInTheDocument();
    });

    vi.mocked(adminBookingApi.getBookings).mockResolvedValueOnce(mockBookingsResponse());
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => {
      expect(screen.getByText('CS-20261003-USER')).toBeInTheDocument();
    });
  });

  it('submits search filter by bookingCode and updates list query', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('CS-20261003-USER')).toBeInTheDocument();
    });

    const codeInput = screen.getByTestId('filter-booking-code-input');
    await user.type(codeInput, '  cs-20261003-user  ');

    const searchBtn = screen.getByTestId('apply-filters-btn');
    await user.click(searchBtn);

    await waitFor(() => {
      expect(adminBookingApi.getBookings).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingCode: 'CS-20261003-USER',
          page: 1,
        }),
        expect.any(AbortSignal),
      );
    });
  });

  it('submits search filter by date and status', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('CS-20261003-USER')).toBeInTheDocument();
    });

    const dateInput = screen.getByTestId('filter-date-input');
    fireEvent.change(dateInput, { target: { value: '2026-10-03' } });

    const statusSelect = screen.getByTestId('filter-status-select');
    await user.selectOptions(statusSelect, 'CONFIRMED');

    const searchBtn = screen.getByTestId('apply-filters-btn');
    await user.click(searchBtn);

    await waitFor(() => {
      expect(adminBookingApi.getBookings).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2026-10-03',
          status: 'CONFIRMED',
          page: 1,
        }),
        expect.any(AbortSignal),
      );
    });
  });

  it('clears all filters when "Xóa bộ lọc" is clicked', async () => {
    const user = userEvent.setup();
    renderComponent('/admin/bookings?bookingCode=CS-20261003-USER&status=CONFIRMED&page=2');

    await waitFor(() => {
      expect(screen.getByTestId('clear-filters-btn')).toBeInTheDocument();
    });

    const clearBtn = screen.getByTestId('clear-filters-btn');
    await user.click(clearBtn);

    await waitFor(() => {
      expect(adminBookingApi.getBookings).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingCode: undefined,
          status: undefined,
          date: undefined,
          page: 1,
        }),
        expect.any(AbortSignal),
      );
    });
  });

  it('handles pagination next and previous buttons', async () => {
    vi.mocked(adminBookingApi.getBookings).mockResolvedValue(
      mockBookingsResponse(mockBookingsList, 25, 3, 1),
    );
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('pagination-next-btn')).toBeInTheDocument();
    });

    const nextBtn = screen.getByTestId('pagination-next-btn');
    expect(nextBtn).not.toBeDisabled();
    const prevBtn = screen.getByTestId('pagination-prev-btn');
    expect(prevBtn).toBeDisabled();

    await user.click(nextBtn);

    await waitFor(() => {
      expect(adminBookingApi.getBookings).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
        }),
        expect.any(AbortSignal),
      );
    });
  });

  it('toggles the guest booking form on toggle button click', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('toggle-guest-form-btn')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('guest-name-input')).not.toBeInTheDocument();

    const toggleBtn = screen.getByTestId('toggle-guest-form-btn');
    await user.click(toggleBtn);

    expect(screen.getByTestId('guest-name-input')).toBeInTheDocument();
  });

  it('refreshes bookings with the CURRENT filters after guest booking creation, without using stale query (F1 Regression)', async () => {
    vi.mocked(adminBookingApi.getBookings).mockResolvedValue(
      mockBookingsResponse(mockBookingsList, 2, 1, 1),
    );
    vi.mocked(roomApi.getRooms).mockResolvedValue({
      success: true,
      message: 'OK',
      data: {
        items: [
          {
            id: 'room-1',
            name: 'Phòng Hội Thảo A',
            capacity: 10,
            pricePerHour: '200.00',
            status: 'AVAILABLE',
            coverImage: null,
            amenities: [],
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });
    const slot = getFutureSlot(4, 2);
    vi.mocked(roomApi.getAvailability).mockImplementation(async (roomId, date) => ({
      success: true,
      message: 'OK',
      data: {
        roomId,
        date,
        timezone: 'Asia/Ho_Chi_Minh',
        slots: create48Slots(date),
      },
    }));

    let resolveGuestCreate: (value: any) => void;
    const guestCreatePromise = new Promise((resolve) => {
      resolveGuestCreate = resolve;
    });
    vi.mocked(adminBookingApi.createGuestBooking).mockReturnValue(guestCreatePromise as any);

    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('toggle-guest-form-btn')).toBeInTheDocument();
    });

    // Open guest form
    await user.click(screen.getByTestId('toggle-guest-form-btn'));
    await screen.findByTestId('guest-name-input');

    // Fill form
    await user.type(screen.getByTestId('guest-name-input'), 'Khách Hàng Mới');
    await user.type(screen.getByTestId('guest-phone-input'), '0988776655');
    await user.selectOptions(screen.getByTestId('guest-room-select'), 'room-1');

    // Pick valid start/end times
    const startInput = screen.getByTestId('guest-start-time-input');
    const endInput = screen.getByTestId('guest-end-time-input');
    fireEvent.change(startInput, { target: { value: slot.startTime } });
    fireEvent.change(endInput, { target: { value: slot.endTime } });

    // Click submit in guest form (creates pending POST)
    await user.click(screen.getByTestId('guest-submit-btn'));

    // While POST is pending, user changes filter in AdminBookingsPage to CANCELLED and clicks search
    const statusSelect = screen.getByTestId('filter-status-select');
    await user.selectOptions(statusSelect, 'CANCELLED');
    await user.click(screen.getByTestId('apply-filters-btn'));

    // Wait for the CANCELLED query to be requested
    await waitFor(() => {
      expect(adminBookingApi.getBookings).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CANCELLED' }),
        expect.any(AbortSignal),
      );
    });

    // Clear mock calls to accurately track what happens when guest booking finishes
    vi.mocked(adminBookingApi.getBookings).mockClear();
    vi.mocked(adminBookingApi.getBookings).mockResolvedValue(mockBookingsResponse([], 0, 1, 1));

    // Now resolve guest booking creation
    resolveGuestCreate!({
      success: true,
      message: 'OK',
      data: {
        id: 'new-guest-booking-id',
        bookingCode: 'CS-20261003-NEWG',
        customer: { kind: 'GUEST', name: 'Khách Hàng Mới', phone: '0988776655' },
        room: { id: 'room-1', name: 'Phòng Hội Thảo A' },
        startTime: slot.startDate.toISOString(),
        endTime: slot.endDate.toISOString(),
        totalAmount: '400000.00',
        status: 'CONFIRMED',
        paymentStatus: 'UNPAID',
        paymentMethod: null,
      },
    });

    // The refresh triggered by guest booking creation MUST query CANCELLED, NOT the old query (empty status)
    await waitFor(() => {
      expect(adminBookingApi.getBookings).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CANCELLED',
        }),
        expect.any(AbortSignal),
      );
    });

    // Must NOT have called getBookings with empty status after guest create
    const calls = vi.mocked(adminBookingApi.getBookings).mock.calls;
    for (const call of calls) {
      expect(call[0]?.status).toBe('CANCELLED');
    }
  });

  describe('Payment Confirmation & Admin Cancellation Actions', () => {
    const unconfirmedBooking: AdminBookingItem = {
      id: 'booking-unpaid-confirmed',
      bookingCode: 'CS-20261003-ACT1',
      room: { id: 'room-1', name: 'Phòng VIP 1' },
      startTime: '2026-10-03T10:00:00.000Z',
      endTime: '2026-10-03T12:00:00.000Z',
      totalAmount: '500000.00',
      note: null,
      status: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      paymentMethod: null,
      customer: { kind: 'USER', name: 'Nguyễn Văn Test', phone: '0901234567' },
    };

    it('opens confirm payment modal, chooses QR, submits successfully, and refetches bookings', async () => {
      const user = userEvent.setup();
      vi.mocked(adminBookingApi.getBookings).mockResolvedValue(
        mockBookingsResponse([unconfirmedBooking], 1, 1, 1),
      );
      vi.mocked(adminBookingApi.confirmPayment).mockResolvedValue({
        success: true,
        message: 'Xác nhận thanh toán thành công',
        data: {
          ...unconfirmedBooking,
          paymentStatus: 'PAID',
          paymentMethod: 'QR',
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CS-20261003-ACT1')).toBeInTheDocument();
      });

      const confirmBtn = screen.getByTestId('confirm-payment-btn-booking-unpaid-confirmed');
      await user.click(confirmBtn);

      expect(screen.getByTestId('confirm-payment-modal')).toBeInTheDocument();

      const methodSelect = screen.getByTestId('payment-method-select');
      await user.selectOptions(methodSelect, 'QR');

      const submitBtn = screen.getByTestId('submit-payment-btn');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(adminBookingApi.confirmPayment).toHaveBeenCalledWith('booking-unpaid-confirmed', {
          paymentMethod: 'QR',
        });
      });

      // Refetches bookings after payment confirmation
      await waitFor(() => {
        expect(adminBookingApi.getBookings).toHaveBeenCalledTimes(2);
      });
    });

    it('opens cancel modal, validates required reason, submits successfully, and refetches bookings', async () => {
      const user = userEvent.setup();
      vi.mocked(adminBookingApi.getBookings).mockResolvedValue(
        mockBookingsResponse([unconfirmedBooking], 1, 1, 1),
      );
      vi.mocked(adminBookingApi.cancelBooking).mockResolvedValue({
        success: true,
        message: 'Hủy đơn đặt phòng thành công',
        data: {
          ...unconfirmedBooking,
          status: 'CANCELLED',
          cancellationReason: 'Khách có việc bận đột xuất',
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CS-20261003-ACT1')).toBeInTheDocument();
      });

      const cancelBtn = screen.getByTestId('cancel-booking-btn-booking-unpaid-confirmed');
      await user.click(cancelBtn);

      expect(screen.getByTestId('admin-cancel-modal')).toBeInTheDocument();

      // Submit without reason -> validation error
      const submitBtn = screen.getByTestId('submit-cancel-btn');
      await user.click(submitBtn);

      expect(screen.getByText('Vui lòng nhập lý do hủy')).toBeInTheDocument();
      expect(adminBookingApi.cancelBooking).not.toHaveBeenCalled();

      // Enter reason and submit
      const reasonInput = screen.getByTestId('cancel-reason-input');
      await user.type(reasonInput, 'Khách có việc bận đột xuất');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(adminBookingApi.cancelBooking).toHaveBeenCalledWith('booking-unpaid-confirmed', {
          reason: 'Khách có việc bận đột xuất',
        });
      });

      // Refetches bookings after cancellation
      await waitFor(() => {
        expect(adminBookingApi.getBookings).toHaveBeenCalledTimes(2);
      });
    });

    it('displays error message when confirm payment fails', async () => {
      const user = userEvent.setup();
      vi.mocked(adminBookingApi.getBookings).mockResolvedValue(
        mockBookingsResponse([unconfirmedBooking], 1, 1, 1),
      );
      vi.mocked(adminBookingApi.confirmPayment).mockRejectedValue({
        response: {
          data: {
            message: 'Đơn đặt phòng đã bị hủy, không thể thanh toán',
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CS-20261003-ACT1')).toBeInTheDocument();
      });

      const confirmBtn = screen.getByTestId('confirm-payment-btn-booking-unpaid-confirmed');
      await user.click(confirmBtn);

      const submitBtn = screen.getByTestId('submit-payment-btn');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Đơn đặt phòng đã bị hủy, không thể thanh toán'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Revenue KPI Summary and State Transition Actions (Complete / No-Show)', () => {
    it('retains the list and reports both errors if refreshing after a conflict fails', async () => {
      const user = userEvent.setup();
      vi.mocked(adminBookingApi.completeBooking).mockRejectedValueOnce({
        response: { status: 409, data: { message: 'Chưa đến giờ kết thúc' } },
      });
      vi.mocked(adminBookingApi.getBookings)
        .mockResolvedValueOnce(mockBookingsResponse())
        .mockRejectedValueOnce(new Error('Network unavailable'));
      renderComponent();
      await user.click(await screen.findByTestId('complete-booking-btn-booking-1'));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Không thể tải danh sách đặt phòng. Vui lòng thử lại.',
        ),
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Chưa đến giờ kết thúc');
      expect(screen.getByTestId('admin-bookings-table')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-bookings-error')).not.toBeInTheDocument();
    });

    it.each([
      ['completeBooking', 'complete-booking-btn-booking-1'],
      ['markNoShow', 'no-show-booking-btn-booking-1'],
    ] as const)('keeps the table and refreshes after %s returns 409', async (method, buttonId) => {
      const user = userEvent.setup();
      vi.mocked(adminBookingApi[method]).mockRejectedValueOnce({
        response: { status: 409, data: { message: 'Trạng thái đặt phòng đã thay đổi' } },
      });
      vi.mocked(adminBookingApi.getBookings)
        .mockResolvedValueOnce(mockBookingsResponse())
        .mockResolvedValue(
          mockBookingsResponse([
            { ...mockBookingsList[0], status: 'NO_SHOW' },
            mockBookingsList[1],
          ]),
        );

      renderComponent();
      await user.click(await screen.findByTestId(buttonId));

      await waitFor(() => expect(adminBookingApi.getBookings).toHaveBeenCalledTimes(2));
      expect(await screen.findByTestId('admin-bookings-table')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Trạng thái đặt phòng đã thay đổi');
      expect(screen.queryByTestId('admin-bookings-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId(buttonId)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Đã hoàn tất ca cho đơn|Đã đánh dấu không đến cho đơn/),
      ).not.toBeInTheDocument();
    });

    it('renders revenue KPI summary card with correct formatted amounts', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('revenue-summary-card')).toBeInTheDocument();
      });

      expect(screen.getByTestId('actual-revenue')).toHaveTextContent('500.000 đ');
      expect(screen.getByTestId('potential-revenue')).toHaveTextContent('800.000 đ');
      expect(screen.getByTestId('unpaid-revenue')).toHaveTextContent('300.000 đ');
      expect(screen.getByText(/Đã thanh toán: 1 đơn/)).toBeInTheDocument();
      expect(screen.getByText(/Chưa thanh toán: 1 đơn/)).toBeInTheDocument();
    });

    it('completes confirmed booking when admin clicks Hoàn tất button', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('complete-booking-btn-booking-1')).toBeInTheDocument();
      });

      const completeBtn = screen.getByTestId('complete-booking-btn-booking-1');
      await user.click(completeBtn);

      await waitFor(() => {
        expect(adminBookingApi.completeBooking).toHaveBeenCalledWith('booking-1');
      });

      expect(screen.getByText('Đã hoàn tất ca cho đơn CS-20261003-USER')).toBeInTheDocument();
    });

    it('marks booking as no-show when admin clicks Không đến button', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('no-show-booking-btn-booking-1')).toBeInTheDocument();
      });

      const noShowBtn = screen.getByTestId('no-show-booking-btn-booking-1');
      await user.click(noShowBtn);

      await waitFor(() => {
        expect(adminBookingApi.markNoShow).toHaveBeenCalledWith('booking-1');
      });

      expect(
        screen.getByText('Đã đánh dấu không đến cho đơn CS-20261003-USER'),
      ).toBeInTheDocument();
    });

    it('displays error message when completing booking fails', async () => {
      const user = userEvent.setup();
      vi.mocked(adminBookingApi.completeBooking).mockRejectedValueOnce({
        response: {
          data: {
            message: 'Đơn đặt phòng đã bị hủy hoặc khách vắng mặt',
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('complete-booking-btn-booking-1')).toBeInTheDocument();
      });

      const completeBtn = screen.getByTestId('complete-booking-btn-booking-1');
      await user.click(completeBtn);

      await waitFor(() => {
        expect(screen.getByText('Đơn đặt phòng đã bị hủy hoặc khách vắng mặt')).toBeInTheDocument();
      });
    });

    it('displays error message when marking no-show fails', async () => {
      const user = userEvent.setup();
      vi.mocked(adminBookingApi.markNoShow).mockRejectedValueOnce({
        response: {
          data: {
            message: 'Đơn đặt phòng đã bị hủy hoặc đã hoàn tất',
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('no-show-booking-btn-booking-1')).toBeInTheDocument();
      });

      const noShowBtn = screen.getByTestId('no-show-booking-btn-booking-1');
      await user.click(noShowBtn);

      await waitFor(() => {
        expect(screen.getByText('Đơn đặt phòng đã bị hủy hoặc đã hoàn tất')).toBeInTheDocument();
      });
    });
  });
});
