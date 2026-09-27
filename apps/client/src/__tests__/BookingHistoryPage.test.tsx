import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BookingHistoryPage } from '../pages/BookingHistoryPage';
import { AuthProvider } from '../context/AuthContext';
import { bookingApi } from '../services/booking.api';
import { BookingResult, GetBookingsResponse } from '../types/booking';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';

vi.mock('../services/booking.api', () => ({
  bookingApi: {
    getBookings: vi.fn(),
  },
}));

const mockBookings: BookingResult[] = [
  {
    id: 'booking-1',
    bookingCode: 'CS-20261025-AAAA',
    room: { id: 'room-1', name: 'Phòng Hội Thảo Alpha' },
    startTime: '2026-10-25T03:00:00.000Z',
    endTime: '2026-10-25T05:00:00.000Z',
    totalAmount: '500000.00',
    note: 'Cần máy chiếu',
    status: 'CONFIRMED',
    paymentStatus: 'UNPAID',
    paymentMethod: null,
  },
  {
    id: 'booking-2',
    bookingCode: 'CS-20261020-BBBB',
    room: { id: 'room-2', name: 'Phòng Sáng Tạo Beta' },
    startTime: '2026-10-20T07:00:00.000Z',
    endTime: '2026-10-20T09:00:00.000Z',
    totalAmount: '350000.00',
    note: null,
    status: 'COMPLETED',
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
  },
];

const mockResponse = (
  items: BookingResult[],
  total: number,
  totalPages: number,
  page = 1,
): GetBookingsResponse => ({
  success: true,
  message: 'Lấy danh sách đặt phòng thành công',
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

describe('BookingHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'cust-1', role: 'CUSTOMER' }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = (initialEntries = ['/bookings']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <Routes>
            <Route path="/bookings" element={<BookingHistoryPage />} />
            <Route path="/bookings/:id" element={<div>Mock Booking Detail Page</div>} />
            <Route path="/" element={<div>Mock Home Page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  };

  it('renders heading, filter tabs, and calls bookingApi.getBookings with defaults', async () => {
    vi.mocked(bookingApi.getBookings).mockResolvedValue(mockResponse(mockBookings, 2, 1));

    renderComponent();

    expect(screen.getByRole('heading', { name: /Lịch sử đặt phòng/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tất cả$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Sắp tới$/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /^Đã hoàn tất$/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await waitFor(() => {
      expect(bookingApi.getBookings).toHaveBeenCalledWith(
        { view: 'ALL', page: 1, limit: 10 },
        expect.any(AbortSignal),
      );
    });
  });

  it('AC2: renders booking items with bookingCode, room name, time, totalAmount, and status', async () => {
    vi.mocked(bookingApi.getBookings).mockResolvedValue(mockResponse(mockBookings, 2, 1));

    renderComponent();

    expect(await screen.findByText('CS-20261025-AAAA')).toBeInTheDocument();

    const item1 = screen.getByTestId('booking-item-booking-1');
    expect(within(item1).getByText('CS-20261025-AAAA')).toBeInTheDocument();
    expect(within(item1).getByText('Phòng Hội Thảo Alpha')).toBeInTheDocument();
    expect(within(item1).getByText('500.000 đ')).toBeInTheDocument();
    expect(within(item1).getByText('Đã xác nhận')).toBeInTheDocument();

    const item2 = screen.getByTestId('booking-item-booking-2');
    expect(within(item2).getByText('CS-20261020-BBBB')).toBeInTheDocument();
    expect(within(item2).getByText('Phòng Sáng Tạo Beta')).toBeInTheDocument();
    expect(within(item2).getByText('350.000 đ')).toBeInTheDocument();
    expect(within(item2).getByText('Đã hoàn tất')).toBeInTheDocument();

    const detailLinks = screen.getAllByRole('link', { name: /Xem chi tiết đơn CS-/i });
    expect(detailLinks).toHaveLength(2);
    expect(detailLinks[0]).toHaveAttribute('href', '/bookings/booking-1');
  });

  it('switches view filters and resets page to 1', async () => {
    vi.mocked(bookingApi.getBookings).mockResolvedValue(mockResponse([mockBookings[0]], 1, 1));

    renderComponent();
    const user = userEvent.setup();

    await screen.findByText('CS-20261025-AAAA');

    // Click "Sắp tới"
    const upcomingBtn = screen.getByRole('button', { name: /^Sắp tới$/i });
    await user.click(upcomingBtn);

    await waitFor(() => {
      expect(bookingApi.getBookings).toHaveBeenCalledWith(
        { view: 'UPCOMING', page: 1, limit: 10 },
        expect.any(AbortSignal),
      );
    });
    expect(upcomingBtn).toHaveAttribute('aria-pressed', 'true');

    // Click "Đã hoàn tất"
    const completedBtn = screen.getByRole('button', { name: /^Đã hoàn tất$/i });
    await user.click(completedBtn);

    await waitFor(() => {
      expect(bookingApi.getBookings).toHaveBeenCalledWith(
        { view: 'COMPLETED', page: 1, limit: 10 },
        expect.any(AbortSignal),
      );
    });
    expect(completedBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('handles pagination navigation and controls', async () => {
    vi.mocked(bookingApi.getBookings).mockResolvedValue(mockResponse([mockBookings[0]], 15, 2, 1));

    renderComponent();
    const user = userEvent.setup();

    expect(await screen.findByText('CS-20261025-AAAA')).toBeInTheDocument();
    expect(screen.getByLabelText('Điều hướng phân trang lịch sử')).toBeInTheDocument();

    const prevBtn = screen.getByRole('button', { name: /Trang trước/i });
    const nextBtn = screen.getByRole('button', { name: /Trang sau/i });

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Click next page
    await user.click(nextBtn);

    await waitFor(() => {
      expect(bookingApi.getBookings).toHaveBeenCalledWith(
        { view: 'ALL', page: 2, limit: 10 },
        expect.any(AbortSignal),
      );
    });
  });

  it('displays empty state for ALL view with link to home', async () => {
    vi.mocked(bookingApi.getBookings).mockResolvedValue(mockResponse([], 0, 0));

    renderComponent();

    expect(await screen.findByText('Bạn chưa có đơn đặt phòng nào.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Khám phá phòng ngay/i })).toHaveAttribute('href', '/');
  });

  it('displays empty state for UPCOMING view', async () => {
    vi.mocked(bookingApi.getBookings).mockResolvedValue(mockResponse([], 0, 0));

    renderComponent(['/bookings?view=UPCOMING']);

    expect(await screen.findByText('Không có đơn đặt phòng nào sắp tới.')).toBeInTheDocument();
  });

  it('displays empty state for COMPLETED view', async () => {
    vi.mocked(bookingApi.getBookings).mockResolvedValue(mockResponse([], 0, 0));

    renderComponent(['/bookings?view=COMPLETED']);

    expect(await screen.findByText('Chưa có đơn đặt phòng nào đã hoàn tất.')).toBeInTheDocument();
  });

  it('displays error state and retries on button click', async () => {
    vi.mocked(bookingApi.getBookings).mockRejectedValueOnce(new Error('Network connection failed'));

    renderComponent();
    const user = userEvent.setup();

    expect(await screen.findByText('Không thể tải lịch sử đặt phòng')).toBeInTheDocument();
    expect(screen.getByText('Network connection failed')).toBeInTheDocument();

    // Now resolve on retry
    vi.mocked(bookingApi.getBookings).mockResolvedValueOnce(mockResponse(mockBookings, 2, 1));

    const retryBtn = screen.getByRole('button', { name: /Thử lại/i });
    await user.click(retryBtn);

    expect(await screen.findByText('CS-20261025-AAAA')).toBeInTheDocument();
  });

  it('guards against stale responses across fast filter changes', async () => {
    let resolveFirst: (res: GetBookingsResponse) => void;
    const firstPromise = new Promise<GetBookingsResponse>((resolve) => {
      resolveFirst = resolve;
    });

    let resolveSecond: (res: GetBookingsResponse) => void;
    const secondPromise = new Promise<GetBookingsResponse>((resolve) => {
      resolveSecond = resolve;
    });

    vi.mocked(bookingApi.getBookings)
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    renderComponent();
    const user = userEvent.setup();

    // Quickly switch to UPCOMING
    const upcomingBtn = screen.getByRole('button', { name: /^Sắp tới$/i });
    await user.click(upcomingBtn);

    // Resolve second request first (UPCOMING data)
    act(() => {
      resolveSecond!(
        mockResponse(
          [
            {
              id: 'booking-upcoming',
              bookingCode: 'CS-UPCOMING-1234',
              room: { id: 'room-1', name: 'Phòng Hội Thảo Alpha' },
              startTime: '2026-10-25T03:00:00.000Z',
              endTime: '2026-10-25T05:00:00.000Z',
              totalAmount: '500000.00',
              note: null,
              status: 'CONFIRMED',
              paymentStatus: 'UNPAID',
              paymentMethod: null,
            },
          ],
          1,
          1,
        ),
      );
    });

    expect(await screen.findByText('CS-UPCOMING-1234')).toBeInTheDocument();

    // Then resolve the older request with stale data
    act(() => {
      resolveFirst!(mockResponse(mockBookings, 2, 1));
    });

    // Stale data should NOT overwrite current data even after macro/microtask delays
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => {
      expect(screen.getByText('CS-UPCOMING-1234')).toBeInTheDocument();
      expect(screen.queryByText('CS-20261020-BBBB')).not.toBeInTheDocument();
    });
  });

  it('guards against stale error overwriting newer successful response', async () => {
    let rejectFirst: (err: Error) => void;
    const firstPromise = new Promise<GetBookingsResponse>((_, reject) => {
      rejectFirst = reject;
    });

    let resolveSecond: (res: GetBookingsResponse) => void;
    const secondPromise = new Promise<GetBookingsResponse>((resolve) => {
      resolveSecond = resolve;
    });

    vi.mocked(bookingApi.getBookings)
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    renderComponent();
    const user = userEvent.setup();

    const upcomingBtn = screen.getByRole('button', { name: /^Sắp tới$/i });
    await user.click(upcomingBtn);

    // Resolve second request successfully
    act(() => {
      resolveSecond!(
        mockResponse(
          [
            {
              id: 'booking-upcoming',
              bookingCode: 'CS-UPCOMING-1234',
              room: { id: 'room-1', name: 'Phòng Hội Thảo Alpha' },
              startTime: '2026-10-25T03:00:00.000Z',
              endTime: '2026-10-25T05:00:00.000Z',
              totalAmount: '500000.00',
              note: null,
              status: 'CONFIRMED',
              paymentStatus: 'UNPAID',
              paymentMethod: null,
            },
          ],
          1,
          1,
        ),
      );
    });

    expect(await screen.findByText('CS-UPCOMING-1234')).toBeInTheDocument();

    // Reject older request
    act(() => {
      rejectFirst!(new Error('Stale network failure'));
    });

    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => {
      expect(screen.getByText('CS-UPCOMING-1234')).toBeInTheDocument();
      expect(screen.queryByText('Không thể tải lịch sử đặt phòng')).not.toBeInTheDocument();
    });
  });

  it('does not leak Customer A bookings when session switches to Customer B (rendered state)', async () => {
    vi.mocked(bookingApi.getBookings).mockResolvedValueOnce(mockResponse(mockBookings, 2, 1));

    renderComponent();

    expect(await screen.findByText('CS-20261025-AAAA')).toBeInTheDocument();

    // Session changes in another tab to Customer B
    const cust2Token = createMockJwt({ sub: 'cust-2', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, cust2Token);

    let resolveCust2: (res: GetBookingsResponse) => void;
    const cust2Promise = new Promise<GetBookingsResponse>((resolve) => {
      resolveCust2 = resolve;
    });
    vi.mocked(bookingApi.getBookings).mockReturnValueOnce(cust2Promise);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: TOKEN_STORAGE_KEY,
          newValue: cust2Token,
        }),
      );
    });

    // Customer A's booking must immediately disappear from Customer B's view
    expect(screen.queryByText('CS-20261025-AAAA')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /Đang tải lịch sử đặt phòng/i })).toBeInTheDocument();

    // Resolve Customer B's request
    act(() => {
      resolveCust2!(
        mockResponse(
          [
            {
              id: 'booking-cust-2',
              bookingCode: 'CS-CUST2-9999',
              room: { id: 'room-2', name: 'Phòng Sáng Tạo Beta' },
              startTime: '2026-10-26T03:00:00.000Z',
              endTime: '2026-10-26T05:00:00.000Z',
              totalAmount: '450000.00',
              note: null,
              status: 'CONFIRMED',
              paymentStatus: 'UNPAID',
              paymentMethod: null,
            },
          ],
          1,
          1,
        ),
      );
    });

    expect(await screen.findByText('CS-CUST2-9999')).toBeInTheDocument();
    expect(screen.queryByText('CS-20261025-AAAA')).not.toBeInTheDocument();
  });

  it('does not render Customer A bookings if session switches to Customer B while request A is in-flight', async () => {
    let resolveCust1: (res: GetBookingsResponse) => void;
    const cust1Promise = new Promise<GetBookingsResponse>((resolve) => {
      resolveCust1 = resolve;
    });
    vi.mocked(bookingApi.getBookings).mockReturnValueOnce(cust1Promise);

    renderComponent();

    // While request 1 is in flight, session changes to Customer B
    const cust2Token = createMockJwt({ sub: 'cust-2', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, cust2Token);

    let resolveCust2: (res: GetBookingsResponse) => void;
    const cust2Promise = new Promise<GetBookingsResponse>((resolve) => {
      resolveCust2 = resolve;
    });
    vi.mocked(bookingApi.getBookings).mockReturnValueOnce(cust2Promise);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: TOKEN_STORAGE_KEY,
          newValue: cust2Token,
        }),
      );
    });

    // Late resolve request 1 for Customer A
    act(() => {
      resolveCust1!(mockResponse(mockBookings, 2, 1));
    });

    // Customer A data must NOT appear
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('CS-20261025-AAAA')).not.toBeInTheDocument();

    // Now resolve Customer B's request
    act(() => {
      resolveCust2!(
        mockResponse(
          [
            {
              id: 'booking-cust-2',
              bookingCode: 'CS-CUST2-9999',
              room: { id: 'room-2', name: 'Phòng Sáng Tạo Beta' },
              startTime: '2026-10-26T03:00:00.000Z',
              endTime: '2026-10-26T05:00:00.000Z',
              totalAmount: '450000.00',
              note: null,
              status: 'CONFIRMED',
              paymentStatus: 'UNPAID',
              paymentMethod: null,
            },
          ],
          1,
          1,
        ),
      );
    });

    expect(await screen.findByText('CS-CUST2-9999')).toBeInTheDocument();
    expect(screen.queryByText('CS-20261025-AAAA')).not.toBeInTheDocument();
  });

  it('renders CANCELLED and NO_SHOW status badges, decimal currency amounts, and overnight bookings', async () => {
    const specialBookings: BookingResult[] = [
      {
        id: 'booking-cancelled',
        bookingCode: 'CS-20261025-CANC',
        room: { id: 'room-1', name: 'Phòng Hội Thảo Alpha' },
        startTime: '2026-10-25T15:00:00.000Z', // 22:00 VN
        endTime: '2026-10-25T19:00:00.000Z', // 02:00 next day VN
        totalAmount: '1234567.50',
        note: null,
        status: 'CANCELLED',
        paymentStatus: 'UNPAID',
        paymentMethod: null,
      },
      {
        id: 'booking-noshow',
        bookingCode: 'CS-20261020-NOSH',
        room: { id: 'room-2', name: 'Phòng Sáng Tạo Beta' },
        startTime: '2026-10-20T07:00:00.000Z',
        endTime: '2026-10-20T09:00:00.000Z',
        totalAmount: '200000.00',
        note: null,
        status: 'NO_SHOW',
        paymentStatus: 'UNPAID',
        paymentMethod: null,
      },
    ];

    vi.mocked(bookingApi.getBookings).mockResolvedValue(mockResponse(specialBookings, 2, 1));

    renderComponent();

    expect(await screen.findByText('CS-20261025-CANC')).toBeInTheDocument();
    expect(screen.getByText('Đã hủy')).toHaveClass('badge-cancelled');
    expect(screen.getByText('Không đến')).toHaveClass('badge-no-show');
    expect(screen.getByText('1.234.567,5 đ')).toBeInTheDocument();
    // Overnight booking displays both dates in VN timezone
    const timeContainers = screen.getAllByTestId('booking-time-value');
    expect(timeContainers[0]).toHaveTextContent(/25\/10\/2026.*26\/10\/2026/);
  });
});
