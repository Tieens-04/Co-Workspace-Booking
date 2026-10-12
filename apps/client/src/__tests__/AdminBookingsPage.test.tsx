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
});
