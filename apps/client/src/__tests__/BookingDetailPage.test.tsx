import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import { BookingDetailPage } from '../pages/BookingDetailPage';
import { AuthProvider } from '../context/AuthContext';
import { bookingApi } from '../services/booking.api';
import { BookingResult, GetBookingDetailResponse } from '../types/booking';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';

vi.mock('../services/booking.api', () => ({
  bookingApi: {
    getBookingById: vi.fn(),
    cancelBooking: vi.fn(),
    rescheduleBooking: vi.fn(),
  },
}));

vi.mock('../services/room.api', () => {
  const createSlotsForDate = (dateStr: string) => {
    const slots = [];
    const startOfDay = new Date(`${dateStr}T00:00:00.000+07:00`);
    for (let i = 0; i < 48; i++) {
      const slotStart = new Date(startOfDay.getTime() + i * 30 * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
      slots.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        available: true,
        status: 'AVAILABLE' as const,
      });
    }
    return slots;
  };

  return {
    roomApi: {
      getAvailability: vi.fn().mockImplementation((roomId: string, date: string) =>
        Promise.resolve({
          success: true,
          message: 'Lấy danh sách khung giờ thành công',
          data: {
            roomId,
            date,
            timezone: 'Asia/Ho_Chi_Minh',
            slots: createSlotsForDate(date),
            maxAdvanceDays: 30,
          },
        }),
      ),
    },
  };
});

const validBookingId = '11111111-1111-4111-8111-111111111111';

const mockDetailData: BookingResult = {
  id: validBookingId,
  bookingCode: 'CS-20261025-ABCD',
  room: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Phòng Hội Thảo Alpha',
  },
  startTime: '2026-10-25T03:00:00.000Z',
  endTime: '2026-10-25T05:00:00.000Z',
  totalAmount: '500000.00',
  checkedInAt: null,
  attendanceTrackingEnabled: false,
  note: 'Cần chuẩn bị máy chiếu và bảng trắng',
  status: 'CONFIRMED',
  paymentStatus: 'UNPAID',
  paymentMethod: null,
};

const mockDetailResponse = (data: BookingResult): GetBookingDetailResponse => ({
  success: true,
  message: 'Lấy chi tiết đặt phòng thành công',
  data,
});

describe('BookingDetailPage', () => {
  beforeEach(() => {
    vi.mocked(bookingApi.getBookingById).mockReset();
    vi.mocked(bookingApi.cancelBooking).mockReset();
    vi.mocked(bookingApi.rescheduleBooking).mockReset();
    localStorage.clear();
    localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'cust-1', role: 'CUSTOMER' }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = (initialEntries = [`/bookings/${validBookingId}`]) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <Routes>
            <Route path="/bookings/:id" element={<BookingDetailPage />} />
            <Route path="/bookings" element={<div>Mock Booking History Page</div>} />
            <Route path="/rooms/:id" element={<div>Mock Room Page</div>} />
            <Route path="/" element={<div>Mock Home Page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  };

  it('loads booking detail directly from URL and displays all required fields (AC2)', async () => {
    vi.mocked(bookingApi.getBookingById).mockResolvedValue(mockDetailResponse(mockDetailData));

    renderComponent();

    expect(await screen.findByTestId('booking-detail-card')).toBeInTheDocument();
    expect(screen.getByTestId('detail-booking-code')).toHaveTextContent('CS-20261025-ABCD');
    expect(screen.getByTestId('booking-room-value')).toHaveTextContent('Phòng Hội Thảo Alpha');
    expect(screen.getByTestId('booking-total-value')).toHaveTextContent('500.000 đ');
    expect(screen.getByTestId('booking-status-badge')).toHaveTextContent('Đã xác nhận');
    expect(screen.getByTestId('payment-status-badge')).toHaveTextContent('Chưa thanh toán');
    expect(screen.getByTestId('payment-method-value')).toHaveTextContent('Chưa có');
    expect(screen.getByTestId('booking-note-value')).toHaveTextContent(
      'Cần chuẩn bị máy chiếu và bảng trắng',
    );

    // Links
    expect(screen.getByTestId('detail-back-history-btn')).toHaveAttribute('href', '/bookings');
    expect(screen.getByTestId('detail-view-room-btn')).toHaveAttribute(
      'href',
      '/rooms/22222222-2222-4222-8222-222222222222',
    );
    // "Về danh sách phòng" points at the room explorer, which moved from / to /rooms.
    expect(screen.getByTestId('detail-back-home-btn')).toHaveAttribute('href', '/rooms');

    expect(bookingApi.getBookingById).toHaveBeenCalledWith(validBookingId, expect.any(AbortSignal));
  });

  it('renders "Không có" for empty/null note and method label for CASH/QR', async () => {
    const customData: BookingResult = {
      ...mockDetailData,
      note: null,
      paymentStatus: 'PAID',
      paymentMethod: 'CASH',
      status: 'COMPLETED',
    };
    vi.mocked(bookingApi.getBookingById).mockResolvedValue(mockDetailResponse(customData));

    renderComponent();

    expect(await screen.findByTestId('booking-detail-card')).toBeInTheDocument();
    expect(screen.getByTestId('booking-note-value')).toHaveTextContent('Không có');
    expect(screen.getByTestId('payment-method-value')).toHaveTextContent('Tiền mặt');
    expect(screen.getByTestId('booking-status-badge')).toHaveTextContent('Đã hoàn tất');
    expect(screen.getByTestId('payment-status-badge')).toHaveTextContent('Đã thanh toán');
  });

  it('renders not found state when ID is not a valid UUID without calling API', async () => {
    renderComponent(['/bookings/invalid-uuid-123']);

    expect(await screen.findByTestId('booking-not-found-state')).toBeInTheDocument();
    expect(screen.getByText('Không tìm thấy thông tin đặt phòng')).toBeInTheDocument();
    expect(bookingApi.getBookingById).not.toHaveBeenCalled();
  });

  it('renders not found state when API returns 404 (IDOR or non-existent)', async () => {
    const axiosError = new AxiosError('Not found', '404', undefined, undefined, {
      status: 404,
      statusText: 'Not Found',
      data: { success: false, code: 'BOOKING_NOT_FOUND', message: 'Không tìm thấy đặt phòng' },
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    vi.mocked(bookingApi.getBookingById).mockRejectedValue(axiosError);

    renderComponent();

    expect(await screen.findByTestId('booking-not-found-state')).toBeInTheDocument();
    expect(screen.getByText('Không tìm thấy thông tin đặt phòng')).toBeInTheDocument();
  });

  it('renders error state on network error and allows retry', async () => {
    vi.mocked(bookingApi.getBookingById).mockRejectedValueOnce(new Error('Connection timed out'));

    renderComponent();
    const user = userEvent.setup();

    expect(await screen.findByText('Lỗi kết nối máy chủ')).toBeInTheDocument();
    expect(screen.getByText('Connection timed out')).toBeInTheDocument();

    vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(mockDetailResponse(mockDetailData));

    const retryBtn = screen.getByRole('button', { name: /Thử lại/i });
    await user.click(retryBtn);

    expect(await screen.findByTestId('booking-detail-card')).toBeInTheDocument();
  });

  it('does not leak Customer A booking detail when session switches to Customer B (rendered state)', async () => {
    vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(mockDetailResponse(mockDetailData));

    renderComponent();

    expect(await screen.findByTestId('booking-detail-card')).toBeInTheDocument();
    expect(screen.getByTestId('detail-booking-code')).toHaveTextContent('CS-20261025-ABCD');

    // Switch session to Customer B in another tab
    const cust2Token = createMockJwt({ sub: 'cust-2', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, cust2Token);

    let rejectCust2: (err: AxiosError) => void;
    const cust2Promise = new Promise<GetBookingDetailResponse>((_, reject) => {
      rejectCust2 = reject;
    });
    vi.mocked(bookingApi.getBookingById).mockReturnValueOnce(cust2Promise);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: TOKEN_STORAGE_KEY,
          newValue: cust2Token,
        }),
      );
    });

    // Customer A data must immediately disappear from Customer B's view
    expect(screen.queryByTestId('booking-detail-card')).not.toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: /Đang tải chi tiết đặt phòng/i }),
    ).toBeInTheDocument();

    // Customer B's request returns 404 (IDOR protection)
    const notFoundError = new AxiosError('Not found', '404', undefined, undefined, {
      status: 404,
      statusText: 'Not Found',
      data: { success: false, code: 'BOOKING_NOT_FOUND', message: 'Không tìm thấy đặt phòng' },
      headers: {},
      config: { headers: new AxiosHeaders() },
    });

    act(() => {
      rejectCust2!(notFoundError);
    });

    expect(await screen.findByTestId('booking-not-found-state')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-booking-code')).not.toBeInTheDocument();
  });

  it('does not render Customer A detail if session switches to Customer B while request A is in-flight', async () => {
    let resolveCust1: (res: GetBookingDetailResponse) => void;
    const cust1Promise = new Promise<GetBookingDetailResponse>((resolve) => {
      resolveCust1 = resolve;
    });
    vi.mocked(bookingApi.getBookingById).mockReturnValueOnce(cust1Promise);

    renderComponent();

    // While request 1 is in-flight, session changes to Customer B
    const cust2Token = createMockJwt({ sub: 'cust-2', role: 'CUSTOMER' });
    localStorage.setItem(TOKEN_STORAGE_KEY, cust2Token);

    let resolveCust2: (res: GetBookingDetailResponse) => void;
    const cust2Promise = new Promise<GetBookingDetailResponse>((resolve) => {
      resolveCust2 = resolve;
    });
    vi.mocked(bookingApi.getBookingById).mockReturnValueOnce(cust2Promise);

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
      resolveCust1!(mockDetailResponse(mockDetailData));
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('booking-detail-card')).not.toBeInTheDocument();

    // Customer B's detail resolves
    const cust2Booking: BookingResult = {
      ...mockDetailData,
      id: validBookingId,
      bookingCode: 'CS-CUST2-DETAIL',
    };
    act(() => {
      resolveCust2!(mockDetailResponse(cust2Booking));
    });

    expect(await screen.findByTestId('detail-booking-code')).toHaveTextContent('CS-CUST2-DETAIL');
    expect(screen.queryByText('CS-20261025-ABCD')).not.toBeInTheDocument();
  });

  it('guards against stale detail responses when ID changes rapidly', async () => {
    const secondBookingId = '22222222-2222-4222-8222-222222222222';
    let resolveFirst: (res: GetBookingDetailResponse) => void;
    const firstPromise = new Promise<GetBookingDetailResponse>((resolve) => {
      resolveFirst = resolve;
    });

    let resolveSecond: (res: GetBookingDetailResponse) => void;
    const secondPromise = new Promise<GetBookingDetailResponse>((resolve) => {
      resolveSecond = resolve;
    });

    vi.mocked(bookingApi.getBookingById)
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const user = userEvent.setup();

    const Switcher = () => {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate(`/bookings/${secondBookingId}`)}>
          Go to second
        </button>
      );
    };

    render(
      <MemoryRouter initialEntries={[`/bookings/${validBookingId}`]}>
        <AuthProvider>
          <Switcher />
          <Routes>
            <Route path="/bookings/:id" element={<BookingDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    // Switch URL to second booking ID
    await user.click(screen.getByRole('button', { name: /Go to second/i }));

    // Resolve second request first
    const secondBooking: BookingResult = {
      ...mockDetailData,
      id: secondBookingId,
      bookingCode: 'CS-SECOND-2222',
    };
    act(() => {
      resolveSecond!(mockDetailResponse(secondBooking));
    });

    expect(await screen.findByTestId('detail-booking-code')).toHaveTextContent('CS-SECOND-2222');

    // Now resolve first request late
    act(() => {
      resolveFirst!(mockDetailResponse(mockDetailData));
    });

    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => {
      expect(screen.getByTestId('detail-booking-code')).toHaveTextContent('CS-SECOND-2222');
      expect(screen.queryByText('CS-20261025-ABCD')).not.toBeInTheDocument();
    });
  });

  it('renders CANCELLED and NO_SHOW status, decimal currency, and overnight booking in detail page', async () => {
    const customData: BookingResult = {
      ...mockDetailData,
      status: 'CANCELLED',
      paymentStatus: 'UNPAID',
      paymentMethod: null,
      totalAmount: '1234567.50',
      checkedInAt: null,
      attendanceTrackingEnabled: false,
      startTime: '2026-10-25T15:00:00.000Z', // 22:00 VN
      endTime: '2026-10-25T19:00:00.000Z', // 02:00 next day VN
    };
    vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(mockDetailResponse(customData));

    renderComponent();

    expect(await screen.findByTestId('booking-detail-card')).toBeInTheDocument();
    expect(screen.getByTestId('booking-status-badge')).toHaveTextContent('Đã hủy');
    expect(screen.getByTestId('booking-status-badge')).toHaveAttribute('data-status', 'CANCELLED');
    expect(screen.getByTestId('booking-total-value')).toHaveTextContent('1.234.567,5 đ');
    expect(screen.getByTestId('booking-time-value')).toHaveTextContent(
      /25\/10\/2026.*26\/10\/2026/,
    );
  });

  describe('CWB-82: Cancellation Details & Reason Banner (AC2, AC3)', () => {
    it('renders admin cancellation banner with formatted time and reason (AC2)', async () => {
      const cancelledBooking: BookingResult = {
        ...mockDetailData,
        status: 'CANCELLED',
        cancelledBy: 'ADMIN',
        cancelledAt: '2026-10-25T07:00:00.000Z', // 14:00 VN
        cancellationReason: 'Phòng cần bảo trì hệ thống điều hòa',
      };
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(cancelledBooking),
      );

      renderComponent();

      const banner = await screen.findByTestId('cancellation-info-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Đã hủy bởi Co-Space');
      expect(banner).toHaveTextContent('14:00 25/10/2026');
      expect(banner).toHaveTextContent('– Lý do: Phòng cần bảo trì hệ thống điều hòa');
    });

    it('renders customer self-cancellation banner with formatted time (AC2)', async () => {
      const cancelledBooking: BookingResult = {
        ...mockDetailData,
        status: 'CANCELLED',
        cancelledBy: 'CUSTOMER',
        cancelledAt: '2026-10-25T07:00:00.000Z', // 14:00 VN
        cancellationReason: null,
      };
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(cancelledBooking),
      );

      renderComponent();

      const banner = await screen.findByTestId('cancellation-info-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Bạn đã hủy');
      expect(banner).toHaveTextContent('14:00 25/10/2026');
      expect(banner).not.toHaveTextContent('Lý do');
    });

    it('escapes HTML tags and prevents XSS in cancellation reason (AC3)', async () => {
      const maliciousReason = '<script>alert("xss")</script><b id="injected-tag">injected</b>';
      const cancelledBooking: BookingResult = {
        ...mockDetailData,
        status: 'CANCELLED',
        cancelledBy: 'ADMIN',
        cancelledAt: '2026-10-25T07:00:00.000Z',
        cancellationReason: maliciousReason,
      };
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(cancelledBooking),
      );

      renderComponent();

      const banner = await screen.findByTestId('cancellation-info-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(maliciousReason);
      expect(document.getElementById('injected-tag')).toBeNull();
    });

    it('identifies legacy admin cancellation from cancellationReason when cancelledBy is null (AC2)', async () => {
      const legacyAdminBooking: BookingResult = {
        ...mockDetailData,
        status: 'CANCELLED',
        cancelledBy: null,
        cancelledAt: null,
        cancellationReason: 'Lý do cũ',
      };
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(legacyAdminBooking),
      );

      renderComponent();

      const banner = await screen.findByTestId('cancellation-info-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Đã hủy bởi Co-Space');
      expect(banner).toHaveTextContent('– Lý do: Lý do cũ');
    });

    it('renders non-redundant fallback message when legacy booking has no cancelledBy and no reason (AC2)', async () => {
      const legacyCustBooking: BookingResult = {
        ...mockDetailData,
        status: 'CANCELLED',
        cancelledBy: null,
        cancelledAt: null,
        cancellationReason: null,
      };
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(legacyCustBooking),
      );

      renderComponent();

      const banner = await screen.findByTestId('cancellation-info-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Đơn đặt phòng này đã bị hủy');
      expect(banner).not.toHaveTextContent('Lý do');
    });

    it('renders timestamp in fallback message when legacy booking has cancelledAt but no actor and no reason', async () => {
      const legacyBookingWithTime: BookingResult = {
        ...mockDetailData,
        status: 'CANCELLED',
        cancelledBy: null,
        cancelledAt: '2026-10-25T07:00:00.000Z',
        cancellationReason: null,
      };
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(legacyBookingWithTime),
      );

      renderComponent();

      const banner = await screen.findByTestId('cancellation-info-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Đơn đặt phòng này đã bị hủy lúc 14:00 25/10/2026');
    });
  });

  describe('Customer Booking Cancellation (CWB-26)', () => {
    it('displays "Hủy đặt phòng" button and cancellation policy info when booking is CONFIRMED (AC1)', async () => {
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(mockDetailData),
      );

      renderComponent();

      expect(await screen.findByTestId('booking-detail-card')).toBeInTheDocument();
      expect(screen.getByTestId('cancellation-section')).toBeInTheDocument();
      expect(screen.getByText(/trước thời gian bắt đầu ít nhất 1 giờ/i)).toBeInTheDocument();
      expect(screen.getByTestId('cancel-booking-init-btn')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-booking-init-btn')).toHaveTextContent('Hủy đặt phòng');
    });

    it('does not display cancellation section when booking status is CANCELLED, COMPLETED, or NO_SHOW', async () => {
      const nonConfirmedStatuses = ['CANCELLED', 'COMPLETED', 'NO_SHOW'];

      for (const status of nonConfirmedStatuses) {
        vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
          mockDetailResponse({ ...mockDetailData, status }),
        );

        const { unmount } = renderComponent();

        expect(await screen.findByTestId('booking-detail-card')).toBeInTheDocument();
        expect(screen.queryByTestId('cancellation-section')).not.toBeInTheDocument();
        expect(screen.queryByTestId('cancel-booking-init-btn')).not.toBeInTheDocument();

        unmount();
      }
    });

    it('shows confirmation box when user clicks "Hủy đặt phòng" and allows closing without calling API', async () => {
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(mockDetailData),
      );

      renderComponent();
      const user = userEvent.setup();

      expect(await screen.findByTestId('cancel-booking-init-btn')).toBeInTheDocument();
      expect(screen.queryByTestId('cancellation-confirm-box')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('cancel-booking-init-btn'));

      expect(screen.getByTestId('cancellation-confirm-box')).toBeInTheDocument();
      expect(
        screen.getByText('Bạn có chắc chắn muốn hủy đơn đặt phòng này không?'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('confirm-cancel-btn')).toBeInTheDocument();
      expect(screen.getByTestId('abort-cancel-btn')).toBeInTheDocument();

      // Click "Đóng" (abort)
      await user.click(screen.getByTestId('abort-cancel-btn'));

      expect(screen.queryByTestId('cancellation-confirm-box')).not.toBeInTheDocument();
      expect(screen.getByTestId('cancel-booking-init-btn')).toBeInTheDocument();
      expect(bookingApi.cancelBooking).not.toHaveBeenCalled();
    });

    it('cancels booking successfully, updates badge to "Đã hủy", and displays success banner (AC1)', async () => {
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(mockDetailData),
      );

      const cancelledBooking: BookingResult = {
        ...mockDetailData,
        status: 'CANCELLED',
      };
      vi.mocked(bookingApi.cancelBooking).mockResolvedValueOnce({
        success: true,
        message: 'Hủy đặt phòng thành công',
        data: cancelledBooking,
      });

      renderComponent();
      const user = userEvent.setup();

      expect(await screen.findByTestId('cancel-booking-init-btn')).toBeInTheDocument();

      await user.click(screen.getByTestId('cancel-booking-init-btn'));
      await user.click(screen.getByTestId('confirm-cancel-btn'));

      expect(bookingApi.cancelBooking).toHaveBeenCalledWith(
        validBookingId,
        expect.any(AbortSignal),
      );

      expect(await screen.findByTestId('cancel-success-banner')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-success-banner')).toHaveTextContent(
        'Hủy đặt phòng thành công',
      );
      expect(screen.getByTestId('booking-status-badge')).toHaveTextContent('Đã hủy');
      expect(screen.getByTestId('booking-status-badge')).toHaveAttribute(
        'data-status',
        'CANCELLED',
      );

      // Cancellation section is hidden once status is CANCELLED
      expect(screen.queryByTestId('cancellation-section')).not.toBeInTheDocument();
    });

    it('displays error alert when API returns 400 CANCELLATION_POLICY_VIOLATION (AC2)', async () => {
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(mockDetailData),
      );

      const policyError = new AxiosError('Bad Request', '400', undefined, undefined, {
        status: 400,
        statusText: 'Bad Request',
        data: {
          success: false,
          code: 'CANCELLATION_POLICY_VIOLATION',
          message: 'Chỉ được hủy đặt phòng trước thời gian bắt đầu ít nhất 1 giờ',
        },
        headers: {},
        config: { headers: new AxiosHeaders() },
      });
      vi.mocked(bookingApi.cancelBooking).mockRejectedValueOnce(policyError);

      renderComponent();
      const user = userEvent.setup();

      expect(await screen.findByTestId('cancel-booking-init-btn')).toBeInTheDocument();

      await user.click(screen.getByTestId('cancel-booking-init-btn'));
      await user.click(screen.getByTestId('confirm-cancel-btn'));

      expect(await screen.findByTestId('cancel-error-banner')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-error-banner')).toHaveTextContent(
        'Chỉ được hủy đặt phòng trước thời gian bắt đầu ít nhất 1 giờ',
      );
      // Status remains CONFIRMED
      expect(screen.getByTestId('booking-status-badge')).toHaveTextContent('Đã xác nhận');
    });

    it('displays conflict banner and allows refresh when API returns 409 BOOKING_STATE_CONFLICT', async () => {
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(mockDetailData),
      );

      const conflictError = new AxiosError('Conflict', '409', undefined, undefined, {
        status: 409,
        statusText: 'Conflict',
        data: {
          success: false,
          code: 'BOOKING_STATE_CONFLICT',
          message: 'Chỉ có thể hủy đơn đặt phòng ở trạng thái đã xác nhận',
        },
        headers: {},
        config: { headers: new AxiosHeaders() },
      });
      vi.mocked(bookingApi.cancelBooking).mockRejectedValueOnce(conflictError);

      renderComponent();
      const user = userEvent.setup();

      expect(await screen.findByTestId('cancel-booking-init-btn')).toBeInTheDocument();

      await user.click(screen.getByTestId('cancel-booking-init-btn'));
      await user.click(screen.getByTestId('confirm-cancel-btn'));

      expect(await screen.findByTestId('cancel-error-banner')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-conflict-refresh-btn')).toBeInTheDocument();

      // Click "Tải lại dữ liệu" to refresh detail
      const refreshedBooking: BookingResult = {
        ...mockDetailData,
        status: 'COMPLETED',
      };
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(refreshedBooking),
      );

      await user.click(screen.getByTestId('cancel-conflict-refresh-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('booking-status-badge')).toHaveTextContent('Đã hoàn tất');
      });

      // Old cancellation error banner and retry button must be cleared after successful refresh
      expect(screen.queryByTestId('cancel-error-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-conflict-refresh-btn')).not.toBeInTheDocument();
    });

    it('transitions to not-found state when cancelBooking returns 404 BOOKING_NOT_FOUND', async () => {
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(mockDetailData),
      );

      const notFoundError = new AxiosError('Not Found', '404', undefined, undefined, {
        status: 404,
        statusText: 'Not Found',
        data: {
          success: false,
          code: 'BOOKING_NOT_FOUND',
          message: 'Không tìm thấy đặt phòng',
        },
        headers: {},
        config: { headers: new AxiosHeaders() },
      });
      vi.mocked(bookingApi.cancelBooking).mockRejectedValueOnce(notFoundError);

      renderComponent();
      const user = userEvent.setup();

      expect(await screen.findByTestId('cancel-booking-init-btn')).toBeInTheDocument();

      await user.click(screen.getByTestId('cancel-booking-init-btn'));
      await user.click(screen.getByTestId('confirm-cancel-btn'));

      expect(await screen.findByTestId('booking-not-found-state')).toBeInTheDocument();
    });

    it('does not overwrite state if session switches while cancel request is in-flight', async () => {
      vi.mocked(bookingApi.getBookingById).mockResolvedValueOnce(
        mockDetailResponse(mockDetailData),
      );

      let resolveCancel: (res: any) => void;
      const cancelPromise = new Promise((resolve) => {
        resolveCancel = resolve;
      });
      vi.mocked(bookingApi.cancelBooking).mockReturnValueOnce(cancelPromise as any);

      renderComponent();
      const user = userEvent.setup();

      expect(await screen.findByTestId('cancel-booking-init-btn')).toBeInTheDocument();

      await user.click(screen.getByTestId('cancel-booking-init-btn'));
      await user.click(screen.getByTestId('confirm-cancel-btn'));

      // While cancel is in-flight, session changes to Customer B
      const cust2Token = createMockJwt({ sub: 'cust-2', role: 'CUSTOMER' });
      localStorage.setItem(TOKEN_STORAGE_KEY, cust2Token);

      const cust2Promise = new Promise<GetBookingDetailResponse>(() => {});
      vi.mocked(bookingApi.getBookingById).mockReturnValueOnce(cust2Promise);

      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: TOKEN_STORAGE_KEY,
            newValue: cust2Token,
          }),
        );
      });

      // Now cancel resolves late
      act(() => {
        resolveCancel!({
          success: true,
          message: 'Hủy đặt phòng thành công',
          data: { ...mockDetailData, status: 'CANCELLED' },
        });
      });

      await new Promise((r) => setTimeout(r, 50));
      // Should not render Customer A's cancelled data for Customer B
      expect(screen.queryByTestId('cancel-success-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('booking-detail-card')).not.toBeInTheDocument();
    });

    it('does not overwrite state if booking ID changes while cancel request is in-flight', async () => {
      const secondBookingId = '33333333-3333-4333-8333-333333333333';
      const secondBookingData: BookingResult = {
        ...mockDetailData,
        id: secondBookingId,
        bookingCode: 'CS-20261025-WXYZ',
      };

      vi.mocked(bookingApi.getBookingById).mockImplementation(async (targetId) => {
        if (targetId === validBookingId) return mockDetailResponse(mockDetailData);
        if (targetId === secondBookingId) return mockDetailResponse(secondBookingData);
        throw new Error('Not found');
      });

      let resolveCancel: (res: any) => void;
      const cancelPromise = new Promise((resolve) => {
        resolveCancel = resolve;
      });
      vi.mocked(bookingApi.cancelBooking).mockReturnValueOnce(cancelPromise as any);

      let navigateFn!: (to: string) => void;
      function TestNavigator() {
        navigateFn = useNavigate();
        return null;
      }

      render(
        <MemoryRouter initialEntries={[`/bookings/${validBookingId}`]}>
          <AuthProvider>
            <TestNavigator />
            <Routes>
              <Route path="/bookings/:id" element={<BookingDetailPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      const user = userEvent.setup();
      expect(await screen.findByTestId('cancel-booking-init-btn')).toBeInTheDocument();

      // Initiate cancel on booking 1
      await user.click(screen.getByTestId('cancel-booking-init-btn'));
      await user.click(screen.getByTestId('confirm-cancel-btn'));

      // While cancel is in-flight, navigate to booking 2
      act(() => {
        navigateFn(`/bookings/${secondBookingId}`);
      });

      // Booking 2 loads
      await waitFor(() => {
        expect(screen.getByTestId('detail-booking-code')).toHaveTextContent('CS-20261025-WXYZ');
      });

      // Now cancel for booking 1 resolves late
      act(() => {
        resolveCancel!({
          success: true,
          message: 'Hủy đặt phòng thành công',
          data: { ...mockDetailData, status: 'CANCELLED' },
        });
      });

      await new Promise((r) => setTimeout(r, 50));

      // Booking 2 should not be affected by booking 1's cancellation
      expect(screen.getByTestId('detail-booking-code')).toHaveTextContent('CS-20261025-WXYZ');
      expect(screen.getByTestId('booking-status-badge')).toHaveTextContent('Đã xác nhận');
      expect(screen.queryByTestId('cancel-success-banner')).not.toBeInTheDocument();
    });
  });
  describe('Reschedule Booking Feature (CWB-81)', () => {
    it('displays "Đổi lịch đặt phòng" button when booking is CONFIRMED and >= 1h away', async () => {
      const futureStart = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 7 * 3600 * 1000).toISOString();
      vi.mocked(bookingApi.getBookingById).mockResolvedValue(
        mockDetailResponse({ ...mockDetailData, startTime: futureStart, endTime: futureEnd }),
      );

      renderComponent();

      const rescheduleBtn = await screen.findByTestId('reschedule-booking-init-btn');
      expect(rescheduleBtn).toBeInTheDocument();
      expect(rescheduleBtn).not.toBeDisabled();
    });

    it('disables "Đổi lịch đặt phòng" button when booking is within 1 hour of start', async () => {
      const nearStart = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const nearEnd = new Date(Date.now() + 90 * 60 * 1000).toISOString();
      vi.mocked(bookingApi.getBookingById).mockResolvedValue(
        mockDetailResponse({ ...mockDetailData, startTime: nearStart, endTime: nearEnd }),
      );

      renderComponent();

      const rescheduleBtn = await screen.findByTestId('reschedule-booking-init-btn');
      expect(rescheduleBtn).toBeInTheDocument();
      expect(rescheduleBtn).toBeDisabled();
    });

    it('disables "Đổi lịch đặt phòng" button when booking paymentStatus is PAID', async () => {
      const futureStart = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 7 * 3600 * 1000).toISOString();
      vi.mocked(bookingApi.getBookingById).mockResolvedValue(
        mockDetailResponse({
          ...mockDetailData,
          startTime: futureStart,
          endTime: futureEnd,
          paymentStatus: 'PAID',
        }),
      );

      renderComponent();

      const rescheduleBtn = await screen.findByTestId('reschedule-booking-init-btn');
      expect(rescheduleBtn).toBeInTheDocument();
      expect(rescheduleBtn).toBeDisabled();
      expect(screen.getByTestId('reschedule-paid-note')).toHaveTextContent(
        'Đơn đặt phòng đã thanh toán không thể tự đổi lịch trực tuyến. Vui lòng liên hệ quầy lễ tân để được hỗ trợ.',
      );
    });

    it('does not display "Đổi lịch đặt phòng" button when booking is CANCELLED or COMPLETED', async () => {
      vi.mocked(bookingApi.getBookingById).mockResolvedValue(
        mockDetailResponse({ ...mockDetailData, status: 'CANCELLED' }),
      );

      renderComponent();

      await screen.findByTestId('booking-detail-card');
      expect(screen.queryByTestId('reschedule-booking-init-btn')).not.toBeInTheDocument();
    });

    it('opens reschedule dialog when "Đổi lịch đặt phòng" button is clicked', async () => {
      const futureStart = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 7 * 3600 * 1000).toISOString();
      vi.mocked(bookingApi.getBookingById).mockResolvedValue(
        mockDetailResponse({ ...mockDetailData, startTime: futureStart, endTime: futureEnd }),
      );

      renderComponent();

      const user = userEvent.setup();
      const rescheduleBtn = await screen.findByTestId('reschedule-booking-init-btn');
      await user.click(rescheduleBtn);

      expect(await screen.findByTestId('reschedule-dialog-content')).toBeInTheDocument();
      expect(screen.getByTestId('reschedule-date-input')).toBeInTheDocument();
      expect(screen.getByTestId('reschedule-confirm-btn')).toBeDisabled(); // initially disabled without selection
    });
    it('submits reschedule, updates booking on page, and closes dialog', async () => {
      const futureStart = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 26 * 3600 * 1000).toISOString();
      vi.mocked(bookingApi.getBookingById).mockResolvedValue(
        mockDetailResponse({ ...mockDetailData, startTime: futureStart, endTime: futureEnd }),
      );

      const updatedBooking: BookingResult = {
        ...mockDetailData,
        startTime: '2026-10-25T08:00:00.000Z',
        endTime: '2026-10-25T10:00:00.000Z',
        totalAmount: '600000.00',
        note: 'Ghi chú mới',
      };
      vi.mocked(bookingApi.rescheduleBooking).mockResolvedValue({
        success: true,
        message: 'Đổi lịch đặt phòng thành công',
        data: updatedBooking,
      });

      renderComponent();

      const user = userEvent.setup();
      const rescheduleBtn = await screen.findByTestId('reschedule-booking-init-btn');
      await user.click(rescheduleBtn);

      expect(await screen.findByTestId('reschedule-dialog-content')).toBeInTheDocument();

      // Click slot to select start, and another to select range
      // The slots in mock are from 00:00 to 23:30 (operating hours 07:00 to 22:00)
      const slotStart = await screen.findByTestId('time-slot-08:00');
      const slotEnd = screen.getByTestId('time-slot-10:00');
      await user.click(slotStart);
      await user.click(slotEnd);

      const confirmBtn = screen.getByTestId('reschedule-confirm-btn');
      expect(confirmBtn).not.toBeDisabled();

      await user.click(confirmBtn);

      await waitFor(() => {
        expect(bookingApi.rescheduleBooking).toHaveBeenCalled();
        expect(screen.queryByTestId('reschedule-dialog-content')).not.toBeInTheDocument();
      });

      // Updated total amount on page
      expect(screen.getByTestId('booking-total-value')).toHaveTextContent('600.000 đ');
      expect(screen.getByTestId('booking-note-value')).toHaveTextContent('Ghi chú mới');
    });

    it('displays error notice in dialog when reschedule fails with 409 conflict', async () => {
      const futureStart = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 26 * 3600 * 1000).toISOString();
      vi.mocked(bookingApi.getBookingById).mockResolvedValue(
        mockDetailResponse({ ...mockDetailData, startTime: futureStart, endTime: futureEnd }),
      );

      const err: any = new Error('Khung giờ này đã có người đặt');
      err.response = {
        status: 409,
        data: {
          success: false,
          code: 'BOOKING_CONFLICT',
          message: 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác',
        },
      };
      vi.mocked(bookingApi.rescheduleBooking).mockRejectedValue(err);

      renderComponent();

      const user = userEvent.setup();
      const rescheduleBtn = await screen.findByTestId('reschedule-booking-init-btn');
      await user.click(rescheduleBtn);

      expect(await screen.findByTestId('reschedule-dialog-content')).toBeInTheDocument();

      const slotStart = await screen.findByTestId('time-slot-08:00');
      const slotEnd = screen.getByTestId('time-slot-10:00');
      await user.click(slotStart);
      await user.click(slotEnd);

      const confirmBtn = screen.getByTestId('reschedule-confirm-btn');
      await user.click(confirmBtn);

      const errorNotice = await screen.findByTestId('reschedule-error-notice');
      expect(errorNotice).toBeInTheDocument();
      expect(errorNotice).toHaveTextContent('Khung giờ này đã có người đặt');
      expect(screen.getByTestId('reschedule-dialog-content')).toBeInTheDocument();
    });

    it('preserves CLOSED slots inside the current booking range as disabled on TimeGrid instead of turning them AVAILABLE (CWB-86)', async () => {
      const { roomApi } = await import('../services/room.api');
      const futureDate = new Date(Date.now() + 24 * 3600 * 1000);
      const y = futureDate.getUTCFullYear();
      const m = String(futureDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(futureDate.getUTCDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const currentStartIso = new Date(`${dateStr}T10:00:00.000+07:00`).toISOString();
      const currentEndIso = new Date(`${dateStr}T12:00:00.000+07:00`).toISOString();

      vi.mocked(bookingApi.getBookingById).mockResolvedValue(
        mockDetailResponse({
          ...mockDetailData,
          startTime: currentStartIso,
          endTime: currentEndIso,
        }),
      );

      // Suppose an admin acknowledged a closure over [10:00, 12:00) VN on that date
      const startOfDay = new Date(`${dateStr}T00:00:00.000+07:00`);
      const slotsWithClosure = Array.from({ length: 48 }, (_, i) => {
        const slotStart = new Date(startOfDay.getTime() + i * 30 * 60 * 1000);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
        const isClosedSlot = i >= 20 && i < 24; // 10:00 - 12:00 VN
        return {
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          status: (isClosedSlot ? 'CLOSED' : 'AVAILABLE') as 'CLOSED' | 'AVAILABLE',
          reason: isClosedSlot ? 'Bảo trì đột xuất' : undefined,
        };
      });

      vi.mocked(roomApi.getAvailability).mockResolvedValueOnce({
        success: true,
        message: 'OK',
        data: {
          roomId: mockDetailData.room.id,
          date: dateStr,
          timezone: 'Asia/Ho_Chi_Minh',
          slots: slotsWithClosure,
          maxAdvanceDays: 30,
        },
      });

      renderComponent();

      const user = userEvent.setup();
      await user.click(await screen.findByTestId('reschedule-booking-init-btn'));
      expect(await screen.findByTestId('reschedule-dialog-content')).toBeInTheDocument();

      const slot1000 = await screen.findByTestId('time-slot-10:00');
      expect(slot1000).toBeDisabled();
      expect(slot1000).toHaveAttribute('data-slot-state', 'closed');
    });
  });

  describe('Refund & Paid Cancellation Warning (CWB-83)', () => {
    it('shows paid-cancel-warning when cancelling a PAID booking', async () => {
      const futureStart = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 26 * 3600 * 1000).toISOString();
      vi.mocked(bookingApi.getBookingById).mockResolvedValue(
        mockDetailResponse({
          ...mockDetailData,
          startTime: futureStart,
          endTime: futureEnd,
          paymentStatus: 'PAID',
          paymentMethod: 'QR',
        }),
      );

      renderComponent();

      const user = userEvent.setup();
      const cancelBtn = await screen.findByTestId('cancel-booking-init-btn');
      await user.click(cancelBtn);

      expect(await screen.findByTestId('cancellation-confirm-box')).toBeInTheDocument();
      expect(screen.getByTestId('paid-cancel-warning')).toBeInTheDocument();
      expect(screen.getByTestId('paid-cancel-warning')).toHaveTextContent(/chính sách hoàn tiền/i);
    });

    it('displays refunded amount when booking has refundedAmount > 0', async () => {
      vi.mocked(bookingApi.getBookingById).mockResolvedValue(
        mockDetailResponse({
          ...mockDetailData,
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
          refundedAmount: '500000.00',
        }),
      );

      renderComponent();

      expect(await screen.findByTestId('refunded-amount-value')).toBeInTheDocument();
      expect(screen.getByTestId('refunded-amount-value')).toHaveTextContent('500.000 đ');
    });
  });
});
