import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BookingForm, BookingFormProps } from '../components/BookingForm';
import { BookingConfirmationPage } from '../pages/BookingConfirmationPage';
import { AuthProvider } from '../context/AuthContext';
import { bookingApi } from '../services/booking.api';
import { roomApi } from '../services/room.api';
import { parseVnDateTimeLocalToUtc } from '../utils/bookingTime';
import { ApiResponse, RoomAvailabilityResponseData, RoomAvailabilitySlot } from '../types/room';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';

vi.mock('../services/booking.api', () => ({
  bookingApi: {
    createBooking: vi.fn(),
  },
}));

vi.mock('../services/room.api', () => ({
  roomApi: {
    getAvailability: vi.fn(),
  },
}));

const mockAvailabilityResponse = (
  date = '2026-10-25',
  roomId = 'room-uuid-1',
): ApiResponse<RoomAvailabilityResponseData> => ({
  success: true,
  message: 'Lấy thông tin lịch trống của phòng thành công',
  data: {
    roomId,
    date,
    timezone: 'Asia/Ho_Chi_Minh',
    slots: Array.from({ length: 48 }, (_, i): RoomAvailabilitySlot => {
      const dayStart = new Date(`${date}T00:00:00.000+07:00`);
      const slotStart = new Date(dayStart.getTime() + i * 30 * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
      return {
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        status: 'AVAILABLE',
      };
    }),
  },
});

describe('BookingForm', () => {
  const defaultProps: BookingFormProps = {
    roomId: 'room-uuid-1',
    roomName: 'Phòng Hội Thảo Alpha',
    roomStatus: 'AVAILABLE',
    pricePerHour: '200000.00',
    isAuthenticated: true,
    userRole: 'CUSTOMER',
    userId: 'customer-user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));
    localStorage.clear();
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      createMockJwt({
        sub: 'customer-user-1',
        role: 'CUSTOMER',
        exp: Math.floor(new Date('2026-10-01T00:00:00.000Z').getTime() / 1000) + 86400,
      }),
    );
    vi.mocked(roomApi.getAvailability).mockImplementation(async (_id, date) =>
      mockAvailabilityResponse(date),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderComponent = (props: Partial<BookingFormProps> = {}, route = '/rooms/room-uuid-1') => {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <Routes>
            <Route path="/rooms/:id" element={<BookingForm {...defaultProps} {...props} />} />
            <Route path="/booking-confirmation" element={<BookingConfirmationPage />} />
            <Route path="/login" element={<div>Mock Login Page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  };

  describe('Authorization and Status States', () => {
    it('renders guest login prompt with return location when user is not authenticated', () => {
      renderComponent({ isAuthenticated: false, userRole: null });

      expect(screen.getByTestId('booking-guest-prompt')).toBeInTheDocument();
      expect(
        screen.getByText(/Vui lòng đăng nhập tài khoản khách hàng để đặt phòng này/i),
      ).toBeInTheDocument();
      const loginLink = screen.getByTestId('booking-login-link');
      expect(loginLink).toBeInTheDocument();
      expect(loginLink).toHaveAttribute('href', '/login');
      expect(screen.queryByLabelText(/Thời gian bắt đầu/i)).not.toBeInTheDocument();
    });

    it('renders admin notice when user is an ADMIN', () => {
      renderComponent({ isAuthenticated: true, userRole: 'ADMIN' });

      expect(screen.getByTestId('booking-admin-notice')).toBeInTheDocument();
      expect(
        screen.getByText(/Tài khoản Quản trị viên không thể đặt phòng qua biểu mẫu khách hàng/i),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/Thời gian bắt đầu/i)).not.toBeInTheDocument();
    });

    it('renders maintenance alert and prevents booking when room status is MAINTENANCE', () => {
      renderComponent({ roomStatus: 'MAINTENANCE' });

      expect(screen.getByTestId('booking-maintenance-box')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/Phòng này đang trong trạng thái/i);
      expect(screen.getByRole('alert')).toHaveTextContent(/Bảo trì/i);
      expect(screen.getByRole('alert')).toHaveTextContent(/không thể tiếp nhận đặt chỗ mới/i);
      expect(screen.queryByLabelText(/Thời gian bắt đầu/i)).not.toBeInTheDocument();
    });
  });

  describe('Form Validation & Price Preview', () => {
    it('validates required fields on submit', async () => {
      const user = userEvent.setup();
      renderComponent();

      const submitBtn = screen.getByTestId('booking-submit-btn');
      await user.click(submitBtn);

      expect(screen.getByText('Vui lòng chọn thời gian bắt đầu')).toBeInTheDocument();
      expect(screen.getByText('Vui lòng chọn thời gian kết thúc')).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
      expect(screen.queryByTestId('booking-review-section')).not.toBeInTheDocument();
    });

    it('validates 30-minute slot alignment', async () => {
      const user = userEvent.setup();
      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const submitBtn = screen.getByTestId('booking-submit-btn');

      // Enter 10:15 (unaligned)
      await user.type(startInput, '2026-10-25T10:15');
      await user.type(endInput, '2026-10-25T11:45');
      await user.click(submitBtn);

      expect(screen.getByText(/Thời gian bắt đầu phải theo mốc 30 phút/i)).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
      expect(screen.queryByTestId('booking-review-section')).not.toBeInTheDocument();
    });

    it('validates minimum 1 hour duration', async () => {
      const user = userEvent.setup();
      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const submitBtn = screen.getByTestId('booking-submit-btn');

      // 30 min duration (10:00 -> 10:30)
      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T10:30');
      await user.click(submitBtn);

      expect(screen.getByText('Thời lượng đặt phòng tối thiểu là 1 giờ')).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
      expect(screen.queryByTestId('booking-review-section')).not.toBeInTheDocument();
    });

    it('allows booking of up to 8 hours (maximum duration) without client error', async () => {
      vi.mocked(bookingApi.createBooking).mockResolvedValueOnce({
        success: true,
        message: 'Đặt phòng thành công',
        data: {
          id: 'booking-1',
          bookingCode: 'CS-20261025-XXXX',
          room: { id: 'room-uuid-1', name: 'Phòng Hội Thảo Alpha' },
          startTime: '2026-10-25T03:00:00.000Z',
          endTime: '2026-10-25T11:00:00.000Z',
          totalAmount: '1600000.00',
          status: 'CONFIRMED',
          paymentStatus: 'UNPAID',
          paymentMethod: null,
          note: null,
        },
      });

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const submitBtn = screen.getByTestId('booking-submit-btn');

      // 8 hours duration (10:00 -> 18:00 VN)
      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T18:00' } });
      await act(async () => {});
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(screen.queryByText(/Thời lượng đặt phòng tối đa/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('booking-review-section')).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();

      // Confirm in review phase
      const confirmBtn = screen.getByTestId('booking-confirm-btn');
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(bookingApi.createBooking).toHaveBeenCalledTimes(1);
      expect(bookingApi.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: parseVnDateTimeLocalToUtc('2026-10-25T10:00')!.toISOString(),
          endTime: parseVnDateTimeLocalToUtc('2026-10-25T18:00')!.toISOString(),
        }),
        expect.any(AbortSignal),
      );
    });

    it('validates maximum 8 hours duration', async () => {
      const user = userEvent.setup();
      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const submitBtn = screen.getByTestId('booking-submit-btn');

      // 8.5 hours duration (10:00 -> 18:30)
      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T18:30' } });
      await user.click(submitBtn);

      expect(screen.getByText('Thời lượng đặt phòng tối đa là 8 giờ')).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
      expect(screen.queryByTestId('booking-review-section')).not.toBeInTheDocument();
    });

    it('shows estimated price preview for valid start and end times', async () => {
      const user = userEvent.setup();
      renderComponent({ pricePerHour: '250000.00' });

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      // 2 hours: 250,000 * 2 = 500,000
      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T12:00');

      expect(screen.getByTestId('booking-price-preview')).toBeInTheDocument();
      expect(screen.getByText('2 giờ')).toBeInTheDocument();
      expect(screen.getByText('500.000 đ')).toBeInTheDocument();
    });

    it('enforces maxLength on note input and validates 500 characters limit', async () => {
      renderComponent();

      const noteInput = screen.getByTestId('booking-note-input') as HTMLTextAreaElement;
      expect(noteInput).toHaveAttribute('maxLength', '500');

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const submitBtn = screen.getByTestId('booking-submit-btn');

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });
      fireEvent.change(noteInput, { target: { value: 'a'.repeat(501) } });

      fireEvent.click(submitBtn);

      expect(screen.getByText('Ghi chú không được vượt quá 500 ký tự')).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
      expect(screen.queryByTestId('booking-review-section')).not.toBeInTheDocument();
    });
  });

  describe('Booking Submission & Outcomes', () => {
    it('submits valid booking and renders success confirmation screen', async () => {
      const user = userEvent.setup();
      const mockResult = {
        id: 'booking-res-123',
        bookingCode: 'CS-20261025-ABCD',
        roomId: 'room-uuid-1',
        userId: 'user-uuid-customer',
        startTime: '2026-10-25T03:00:00.000Z',
        endTime: '2026-10-25T05:00:00.000Z',
        totalAmount: '400000.00',
        status: 'CONFIRMED' as const,
        paymentStatus: 'UNPAID' as const,
        paymentMethod: null,
        note: 'Cần thêm 2 ghế',
        createdAt: '2026-10-25T01:00:00.000Z',
        room: {
          id: 'room-uuid-1',
          name: 'Phòng Hội Thảo Alpha',
          pricePerHour: '200000.00',
        },
      };

      vi.mocked(bookingApi.createBooking).mockResolvedValueOnce({
        success: true,
        message: 'Đặt phòng thành công',
        data: mockResult,
      });

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const noteInput = screen.getByLabelText(/Ghi chú/i);
      const reviewBtn = screen.getByTestId('booking-submit-btn');

      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T12:00');
      await user.type(noteInput, 'Cần thêm 2 ghế');
      await user.click(reviewBtn);

      // Verify review phase is rendered and API has NOT been called yet
      expect(screen.getByTestId('booking-review-section')).toBeInTheDocument();
      expect(screen.getByTestId('review-room-name')).toHaveTextContent('Phòng Hội Thảo Alpha');
      expect(screen.getByTestId('review-duration')).toHaveTextContent('2 giờ');
      expect(screen.getByTestId('review-estimated-total')).toHaveTextContent('400.000 đ');
      expect(screen.getByTestId('review-note')).toHaveTextContent('Cần thêm 2 ghế');
      expect(bookingApi.createBooking).not.toHaveBeenCalled();

      // Submit from review screen
      const confirmBtn = screen.getByTestId('booking-confirm-btn');
      await user.click(confirmBtn);

      expect(bookingApi.createBooking).toHaveBeenCalledWith(
        {
          roomId: 'room-uuid-1',
          startTime: parseVnDateTimeLocalToUtc('2026-10-25T10:00')!.toISOString(),
          endTime: parseVnDateTimeLocalToUtc('2026-10-25T12:00')!.toISOString(),
          note: 'Cần thêm 2 ghế',
        },
        expect.any(AbortSignal),
      );

      // Verify confirmation screen (AC2)
      expect(await screen.findByTestId('booking-confirmation-view')).toBeInTheDocument();
      expect(screen.getByTestId('booking-confirmation-code')).toHaveTextContent('CS-20261025-ABCD');
      expect(screen.getByTestId('booking-confirmation-total')).toHaveTextContent('400.000 đ');
      expect(screen.getByTestId('booking-confirmation-status')).toHaveTextContent('CONFIRMED');
      expect(screen.getByTestId('booking-confirmation-payment')).toHaveTextContent('UNPAID');
      expect(screen.getByTestId('booking-payment-instruction')).toHaveTextContent(
        /thanh toán tại quầy/i,
      );
    });

    it('allows returning to edit phase from review, preserves input, and allows subsequent submission', async () => {
      const user = userEvent.setup();
      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const noteInput = screen.getByLabelText(/Ghi chú/i);

      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T12:00');
      await user.type(noteInput, 'Ghi chú ban đầu');
      await user.click(screen.getByTestId('booking-submit-btn'));

      // Check review
      expect(screen.getByTestId('booking-review-section')).toBeInTheDocument();
      expect(screen.getByTestId('review-note')).toHaveTextContent('Ghi chú ban đầu');

      // Click "Quay lại chỉnh sửa"
      await user.click(screen.getByTestId('booking-back-btn'));

      // In edit form, values are preserved
      expect(screen.getByLabelText(/Thời gian bắt đầu/i)).toHaveValue('2026-10-25T10:00');
      expect(screen.getByLabelText(/Thời gian kết thúc/i)).toHaveValue('2026-10-25T12:00');
      expect(screen.getByLabelText(/Ghi chú/i)).toHaveValue('Ghi chú ban đầu');

      // Edit note
      await user.clear(screen.getByLabelText(/Ghi chú/i));
      await user.type(screen.getByLabelText(/Ghi chú/i), 'Ghi chú đã cập nhật');
      await user.click(screen.getByTestId('booking-submit-btn'));

      expect(screen.getByTestId('review-note')).toHaveTextContent('Ghi chú đã cập nhật');
    });

    it('handles 409 BOOKING_CONFLICT error by keeping inputs and showing clear conflict error', async () => {
      const user = userEvent.setup();
      const conflictError = {
        name: 'AxiosError',
        response: {
          status: 409,
          data: {
            code: 'BOOKING_CONFLICT',
            message: 'Phòng đã có người đặt trong khoảng thời gian này.',
          },
        },
      };

      vi.mocked(bookingApi.createBooking).mockRejectedValueOnce(conflictError);

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T12:00');
      await user.click(screen.getByTestId('booking-submit-btn'));

      const confirmBtn = screen.getByTestId('booking-confirm-btn');
      await user.click(confirmBtn);

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(
        screen.getByText('Phòng đã có người đặt trong khoảng thời gian này.'),
      ).toBeInTheDocument();

      // Return to edit to verify inputs are preserved
      await user.click(screen.getByTestId('booking-back-btn'));
      expect(screen.getByLabelText(/Thời gian bắt đầu/i)).toHaveValue('2026-10-25T10:00');
      expect(screen.getByLabelText(/Thời gian kết thúc/i)).toHaveValue('2026-10-25T12:00');
    });

    it('handles 409 ROOM_NOT_AVAILABLE by transitioning component to maintenance alert view', async () => {
      const user = userEvent.setup();
      const maintenanceError = {
        name: 'AxiosError',
        response: {
          status: 409,
          data: {
            code: 'ROOM_NOT_AVAILABLE',
            message: 'Phòng đang trong trạng thái bảo trì, không thể tiếp nhận đặt chỗ.',
          },
        },
      };

      vi.mocked(bookingApi.createBooking).mockRejectedValueOnce(maintenanceError);

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T12:00');
      await user.click(screen.getByTestId('booking-submit-btn'));

      await user.click(screen.getByTestId('booking-confirm-btn'));

      // Transitions to maintenance banner
      expect(await screen.findByTestId('booking-maintenance-box')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/Bảo trì/i);
    });

    it('handles generic server error safely', async () => {
      const user = userEvent.setup();
      const genericError = {
        name: 'AxiosError',
        response: {
          status: 500,
          data: {
            code: 'INTERNAL_ERROR',
            message: 'Đã xảy ra lỗi hệ thống, vui lòng thử lại.',
          },
        },
      };

      vi.mocked(bookingApi.createBooking).mockRejectedValueOnce(genericError);

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T12:00');
      await user.click(screen.getByTestId('booking-submit-btn'));

      await user.click(screen.getByTestId('booking-confirm-btn'));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Đã xảy ra lỗi hệ thống, vui lòng thử lại.')).toBeInTheDocument();
    });

    it('prevents duplicate submission while booking request is in flight', async () => {
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(bookingApi.createBooking).mockReturnValue(pendingPromise as any);

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });
      await act(async () => {});
      fireEvent.click(screen.getByTestId('booking-submit-btn'));

      const confirmBtn = screen.getByTestId('booking-confirm-btn');

      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(bookingApi.createBooking).toHaveBeenCalledTimes(1);
      expect(confirmBtn).toBeDisabled();
      expect(screen.getByText('Đang gửi yêu cầu đặt...')).toBeInTheDocument();

      // Click again while submitting
      fireEvent.click(confirmBtn);
      expect(bookingApi.createBooking).toHaveBeenCalledTimes(1);

      // Clean up promise
      await act(async () => {
        resolvePromise!({
          success: true,
          data: {
            id: 'b-1',
            bookingCode: 'CS-20261025-XXXX',
            room: { id: 'room-uuid-1', name: 'Phòng Hội Thảo Alpha' },
            startTime: '2026-10-25T03:00:00.000Z',
            endTime: '2026-10-25T05:00:00.000Z',
            totalAmount: '400000.00',
            status: 'CONFIRMED',
            paymentStatus: 'UNPAID',
            paymentMethod: null,
          },
        });
      });
    });

    it('aborts pending request when component unmounts', async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.mocked(bookingApi.createBooking).mockImplementation(
        (_payload: any, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise(() => {}); // never resolves
        },
      );

      const { unmount } = renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });
      await act(async () => {});
      fireEvent.click(screen.getByTestId('booking-submit-btn'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-confirm-btn'));
      });

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal!.aborted).toBe(false);

      unmount();

      expect(capturedSignal!.aborted).toBe(true);
    });

    it('resets form and aborts pending request when roomId changes', async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.mocked(bookingApi.createBooking).mockImplementation(
        (_payload: any, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise(() => {});
        },
      );

      const { rerender } = renderComponent({ roomId: 'room-uuid-1' });

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const noteInput = screen.getByLabelText(/Ghi chú/i);

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });
      fireEvent.change(noteInput, { target: { value: 'Ghi chú phòng 1' } });
      await act(async () => {});
      fireEvent.click(screen.getByTestId('booking-submit-btn'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-confirm-btn'));
      });

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal!.aborted).toBe(false);

      // Change roomId prop
      rerender(
        <MemoryRouter initialEntries={['/rooms/room-uuid-2']}>
          <Routes>
            <Route
              path="/rooms/:id"
              element={<BookingForm {...defaultProps} roomId="room-uuid-2" />}
            />
            <Route path="/booking-confirmation" element={<BookingConfirmationPage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(capturedSignal!.aborted).toBe(true);
      expect(screen.getByLabelText(/Thời gian bắt đầu/i)).toHaveValue('');
      expect(screen.getByLabelText(/Thời gian kết thúc/i)).toHaveValue('');
      expect(screen.getByLabelText(/Ghi chú/i)).toHaveValue('');
    });
  });

  describe('CWB-21 TimeGrid & Two-Way Sync Integration', () => {
    it('syncs TimeGrid range click into datetime-local inputs and shows preview', async () => {
      renderComponent();

      // Click 09:00 slot (start), then 10:30 slot (end)
      const slotStart = await screen.findByTestId('time-slot-09:00');
      fireEvent.click(slotStart);

      const slotEnd = screen.getByTestId('time-slot-10:30');
      fireEvent.click(slotEnd);

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      expect(startInput).toHaveValue('2026-10-01T09:00');
      expect(endInput).toHaveValue('2026-10-01T11:00');

      // 2 hours: 200,000 * 2 = 400,000
      expect(screen.getByTestId('booking-price-preview')).toBeInTheDocument();
      expect(screen.getByText('2 giờ')).toBeInTheDocument();
      expect(screen.getByText('400.000 đ')).toBeInTheDocument();
    });

    it('resets selection and loads new availability when view date changes', async () => {
      renderComponent();

      const dateInput = screen.getByTestId('booking-view-date-input');
      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });

      // Change view date
      fireEvent.change(dateInput, { target: { value: '2026-10-28' } });

      expect(startInput).toHaveValue('');
      expect(endInput).toHaveValue('');
      expect(roomApi.getAvailability).toHaveBeenCalledWith(
        'room-uuid-1',
        '2026-10-28',
        expect.any(AbortSignal),
      );
    });

    it('updates view date input when manually editing startTime with a new date', () => {
      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const dateInput = screen.getByTestId('booking-view-date-input');

      fireEvent.change(startInput, { target: { value: '2026-10-29T14:00' } });

      expect(dateInput).toHaveValue('2026-10-29');
    });

    it('stops submission during preflight refresh when a conflicting BOOKED slot is detected', async () => {
      // Mock preflight refresh returning a booked slot at 10:30
      const bookedResponse = mockAvailabilityResponse('2026-10-25');
      // Slot 21 (10:30 - 11:00) is BOOKED
      bookedResponse.data.slots[21].status = 'BOOKED';

      vi.mocked(roomApi.getAvailability).mockImplementation(async (_id, date) =>
        mockAvailabilityResponse(date),
      );

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });
      await act(async () => {});
      fireEvent.click(screen.getByTestId('booking-submit-btn'));

      // Now set mock for the preflight call to return booked slot
      vi.mocked(roomApi.getAvailability).mockResolvedValueOnce(bookedResponse);

      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-confirm-btn'));
      });

      expect(bookingApi.createBooking).not.toHaveBeenCalled();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác hoặc điều chỉnh thời gian.',
        ),
      ).toBeInTheDocument();
    });

    it('supports overnight booking across midnight and loads both dates', async () => {
      vi.mocked(bookingApi.createBooking).mockResolvedValueOnce({
        success: true,
        message: 'Đặt phòng thành công',
        data: {
          id: 'booking-overnight',
          bookingCode: 'CS-20261025-OVER',
          room: { id: 'room-uuid-1', name: 'Phòng Hội Thảo Alpha' },
          startTime: '2026-10-25T16:00:00.000Z', // 23:00 VN
          endTime: '2026-10-25T18:00:00.000Z', // 01:00 VN next day
          totalAmount: '400000.00',
          status: 'CONFIRMED',
          paymentStatus: 'UNPAID',
          paymentMethod: null,
          note: null,
        },
      });

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      // 23:00 to 01:00 next day (2 hours)
      fireEvent.change(startInput, { target: { value: '2026-10-25T23:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-26T01:00' } });

      expect(await screen.findByTestId('booking-price-preview')).toBeInTheDocument();
      expect(screen.getByText('2 giờ')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('booking-submit-btn'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-confirm-btn'));
      });

      // Both dates should be requested
      expect(roomApi.getAvailability).toHaveBeenCalledWith(
        'room-uuid-1',
        '2026-10-25',
        expect.any(AbortSignal),
      );
      expect(roomApi.getAvailability).toHaveBeenCalledWith(
        'room-uuid-1',
        '2026-10-26',
        expect.any(AbortSignal),
      );

      expect(bookingApi.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: parseVnDateTimeLocalToUtc('2026-10-25T23:00')!.toISOString(),
          endTime: parseVnDateTimeLocalToUtc('2026-10-26T01:00')!.toISOString(),
        }),
        expect.any(AbortSignal),
      );
    });
  });

  describe('Review Findings Regressions (F1, F2, F3)', () => {
    it('F1: stops submission and rejects when lead time boundary is crossed during delayed preflight GET', async () => {
      // Set time to 08:29:50 VN on 2026-10-25 (30m10s before 09:00)
      vi.setSystemTime(new Date('2026-10-25T08:29:50.000+07:00'));

      let resolveAvailability: (val: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolveAvailability = resolve;
      });

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      fireEvent.change(startInput, { target: { value: '2026-10-25T09:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T10:00' } });
      await act(async () => {});
      fireEvent.click(screen.getByTestId('booking-submit-btn'));

      // Next call to getAvailability will be the preflight
      vi.mocked(roomApi.getAvailability).mockImplementationOnce(() => delayedPromise as any);

      // User clicks confirm on review screen
      fireEvent.click(screen.getByTestId('booking-confirm-btn'));

      // During preflight delay, time advances 20 seconds to 08:30:10 VN (< 30 min before 09:00)
      vi.setSystemTime(new Date('2026-10-25T08:30:10.000+07:00'));

      // Preflight resolves
      await act(async () => {
        resolveAvailability!(mockAvailabilityResponse('2026-10-25'));
      });

      // Must NOT call POST createBooking
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
      // Must show field error for startTime
      expect(await screen.findByTestId('error-booking-start')).toHaveTextContent(
        'Phải đặt phòng trước thời gian bắt đầu ít nhất 30 phút',
      );
    });

    it('F2: suppresses preview and does not highlight slots when range spans a BOOKED slot', async () => {
      const bookedResponse = mockAvailabilityResponse('2026-10-25');
      // Slot 21 (10:30 - 11:00) is BOOKED
      bookedResponse.data.slots[21].status = 'BOOKED';

      vi.mocked(roomApi.getAvailability).mockResolvedValue(bookedResponse);

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      // Range 10:00 - 12:00 spans slot 10:30 (BOOKED)
      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });

      await act(async () => {});

      // Preview must be suppressed
      expect(screen.queryByTestId('booking-price-preview')).not.toBeInTheDocument();

      // TimeGrid slots must NOT be highlighted as slot-selected
      const slot1000 = screen.getByTestId('time-slot-10:00');
      expect(slot1000).not.toHaveClass('slot-selected');
      expect(slot1000).toHaveAttribute('aria-pressed', 'false');

      const slot1030 = screen.getByTestId('time-slot-10:30');
      expect(slot1030).toHaveClass('slot-booked');
      expect(slot1030).toHaveAttribute('aria-pressed', 'false');
    });

    it('F2: suppresses preview when duration is 30 minutes (< 1 hour)', async () => {
      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T10:30' } });

      expect(screen.queryByTestId('booking-price-preview')).not.toBeInTheDocument();
    });

    it('F2: suppresses preview when duration is > 8 hours', async () => {
      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      fireEvent.change(startInput, { target: { value: '2026-10-25T09:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T18:00' } });

      expect(screen.queryByTestId('booking-price-preview')).not.toBeInTheDocument();
    });

    it('F2: suppresses preview when overnight range has BOOKED slot on second date', async () => {
      vi.mocked(roomApi.getAvailability).mockImplementation(async (_id, date) => {
        const res = mockAvailabilityResponse(date);
        if (date === '2026-10-26') {
          // Slot 1 (00:30 - 01:00 VN) is BOOKED
          res.data.slots[1].status = 'BOOKED';
        }
        return res;
      });

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      // Overnight: 23:00 on 25th to 02:00 on 26th
      fireEvent.change(startInput, { target: { value: '2026-10-25T23:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-26T02:00' } });

      await act(async () => {});

      // Preview must NOT be rendered because 00:30 on 26th is BOOKED
      expect(screen.queryByTestId('booking-price-preview')).not.toBeInTheDocument();
    });

    it('F3: transitions to maintenance view when initial GET returns 409 ROOM_NOT_AVAILABLE', async () => {
      vi.mocked(roomApi.getAvailability).mockRejectedValueOnce({
        name: 'AxiosError',
        response: {
          status: 409,
          data: {
            code: 'ROOM_NOT_AVAILABLE',
            message: 'Phòng đang trong trạng thái bảo trì',
          },
        },
      });

      renderComponent();

      expect(await screen.findByTestId('booking-maintenance-box')).toBeInTheDocument();
      expect(screen.queryByTestId('customer-booking-form')).not.toBeInTheDocument();
      expect(screen.queryByTestId('booking-submit-btn')).not.toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
    });

    it('F3: transitions to maintenance view when date change GET returns 409 ROOM_NOT_AVAILABLE', async () => {
      // First call for initial date succeeds
      vi.mocked(roomApi.getAvailability).mockResolvedValueOnce(
        mockAvailabilityResponse('2026-10-25'),
      );

      renderComponent();

      expect(await screen.findByTestId('customer-booking-form')).toBeInTheDocument();

      // Next call for new date returns 409
      vi.mocked(roomApi.getAvailability).mockRejectedValueOnce({
        name: 'AxiosError',
        response: {
          status: 409,
          data: {
            code: 'ROOM_NOT_AVAILABLE',
            message: 'Phòng đang trong trạng thái bảo trì',
          },
        },
      });

      const dateInput = screen.getByTestId('booking-view-date-input');
      fireEvent.change(dateInput, { target: { value: '2026-10-26' } });

      expect(await screen.findByTestId('booking-maintenance-box')).toBeInTheDocument();
      expect(screen.queryByTestId('customer-booking-form')).not.toBeInTheDocument();
    });

    it('F3: resetting roomId clears maintenance error state for a newly selected room', async () => {
      vi.mocked(roomApi.getAvailability).mockRejectedValueOnce({
        name: 'AxiosError',
        response: {
          status: 409,
          data: {
            code: 'ROOM_NOT_AVAILABLE',
            message: 'Phòng đang trong trạng thái bảo trì',
          },
        },
      });

      const { rerender } = renderComponent({ roomId: 'room-maintenance' });

      expect(await screen.findByTestId('booking-maintenance-box')).toBeInTheDocument();

      // Now switch to room-available which returns 200
      vi.mocked(roomApi.getAvailability).mockResolvedValueOnce(
        mockAvailabilityResponse('2026-10-25', 'room-available'),
      );

      rerender(
        <MemoryRouter>
          <BookingForm {...defaultProps} roomId="room-available" />
        </MemoryRouter>,
      );

      expect(await screen.findByTestId('customer-booking-form')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-maintenance-box')).not.toBeInTheDocument();
    });

    it('N2: POST 409 conflict with reload network error clears preview, disables submit, and keeps inputs', async () => {
      // Mock initial availability successful with all slots AVAILABLE
      vi.mocked(roomApi.getAvailability).mockResolvedValue(mockAvailabilityResponse('2026-10-25'));

      // Mock POST createBooking returning 409 BOOKING_CONFLICT
      const conflictError = {
        name: 'AxiosError',
        response: {
          status: 409,
          data: {
            code: 'BOOKING_CONFLICT',
            message: 'Phòng đã có người đặt trong khoảng thời gian này.',
          },
        },
      };
      vi.mocked(bookingApi.createBooking).mockRejectedValueOnce(conflictError);

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      // Select 10:00 to 12:00
      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });

      expect(await screen.findByTestId('booking-price-preview')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('booking-submit-btn'));

      // Preflight succeeds
      vi.mocked(roomApi.getAvailability).mockResolvedValueOnce(
        mockAvailabilityResponse('2026-10-25'),
      );
      // For the reload call after POST failure, return network error
      vi.mocked(roomApi.getAvailability).mockRejectedValueOnce(new Error('Network error'));

      // Submit booking
      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-confirm-btn'));
      });

      // Conflict error must be displayed
      expect(await screen.findByTestId('booking-general-error')).toHaveTextContent(
        'Phòng đã có người đặt trong khoảng thời gian này.',
      );

      // Return to edit phase to check input, preview, and retry behavior
      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-back-btn'));
      });

      // Inputs must be preserved
      expect(startInput).toHaveValue('2026-10-25T10:00');
      expect(endInput).toHaveValue('2026-10-25T12:00');

      // N2: Preview must NOT be rendered from stale snapshot
      expect(screen.queryByTestId('booking-price-preview')).not.toBeInTheDocument();

      // N2: Submit button must be disabled
      const editSubmitBtn = screen.getByTestId('booking-submit-btn');
      expect(editSubmitBtn).toBeDisabled();

      // N2: TimeGrid is replaced by retry alert while availability is in error state
      expect(screen.queryByTestId('time-slot-10:00')).not.toBeInTheDocument();
      expect(screen.getByTestId('booking-retry-availability-btn')).toBeInTheDocument();

      // When retry succeeds, availability recovers, TimeGrid and preview reappear, submit enabled
      vi.mocked(roomApi.getAvailability).mockResolvedValue(mockAvailabilityResponse('2026-10-25'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-retry-availability-btn'));
      });

      expect(await screen.findByTestId('time-slot-10:00')).toBeInTheDocument();
      expect(await screen.findByTestId('booking-price-preview')).toBeInTheDocument();
      expect(editSubmitBtn).not.toBeDisabled();
    });

    it('N2: clears preview and highlight when refresh after POST conflict receives updated BOOKED slot', async () => {
      // Mock initial availability successful
      vi.mocked(roomApi.getAvailability).mockResolvedValue(mockAvailabilityResponse('2026-10-25'));

      const conflictError = {
        name: 'AxiosError',
        response: {
          status: 409,
          data: {
            code: 'BOOKING_CONFLICT',
            message: 'Phòng đã có người đặt trong khoảng thời gian này.',
          },
        },
      };
      vi.mocked(bookingApi.createBooking).mockRejectedValueOnce(conflictError);

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });

      expect(await screen.findByTestId('booking-price-preview')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('booking-submit-btn'));

      // Preflight succeeds
      vi.mocked(roomApi.getAvailability).mockResolvedValueOnce(
        mockAvailabilityResponse('2026-10-25'),
      );
      // The refresh call after conflict returns slot 21 (10:30) as BOOKED
      const updatedResponse = mockAvailabilityResponse('2026-10-25');
      updatedResponse.data.slots[21].status = 'BOOKED';
      vi.mocked(roomApi.getAvailability).mockResolvedValueOnce(updatedResponse);

      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-confirm-btn'));
      });

      // Conflict error displayed
      expect(await screen.findByTestId('booking-general-error')).toHaveTextContent(
        'Phòng đã có người đặt trong khoảng thời gian này.',
      );

      // Return to edit phase to check slot and preview state
      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-back-btn'));
      });

      // Preview must disappear
      expect(screen.queryByTestId('booking-price-preview')).not.toBeInTheDocument();

      // Slot 10:30 must be displayed as BOOKED and disabled
      const slot1030 = screen.getByTestId('time-slot-10:30');
      expect(slot1030).toHaveClass('slot-booked');
      expect(slot1030).toBeDisabled();
      expect(slot1030).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('Review Findings Regressions - Review 01', () => {
    it('Finding 2: prevents entering review when availability is still pending, then allows review with full duration and total once loaded', async () => {
      let resolveAvailability!: (val: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolveAvailability = resolve;
      });

      // Keep availability request pending
      vi.mocked(roomApi.getAvailability).mockImplementation(() => pendingPromise as any);

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const submitBtn = screen.getByTestId('booking-submit-btn');

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });

      // While availability is pending, submit button displays loading indicator
      expect(submitBtn).toHaveTextContent(/Đang kiểm tra lịch trống/i);

      // Attempting to submit should not transition to review phase, but keep in edit with waiting message
      fireEvent.click(submitBtn);
      expect(screen.queryByTestId('booking-review-section')).not.toBeInTheDocument();
      expect(screen.getByTestId('booking-general-error')).toHaveTextContent(
        'Đang tải dữ liệu lịch trống của phòng, vui lòng đợi trong giây lát.',
      );

      // Resolve availability
      await act(async () => {
        resolveAvailability(mockAvailabilityResponse('2026-10-25'));
      });

      // Now availability is loaded: submit button is ready
      expect(submitBtn).toHaveTextContent('Tiếp tục xem lại thông tin');

      // Click to proceed to review
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      // Review section is rendered with complete duration and total
      expect(screen.getByTestId('booking-review-section')).toBeInTheDocument();
      expect(screen.getByTestId('review-duration')).toHaveTextContent('2 giờ (120 phút)');
      expect(screen.getByTestId('review-estimated-total')).toHaveTextContent('400.000 đ');
    });

    it('Finding 2: preserves duration and total on review screen and allows returning to edit mode', async () => {
      vi.mocked(roomApi.getAvailability).mockResolvedValue(mockAvailabilityResponse('2026-10-25'));

      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });
      await act(async () => {});

      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-submit-btn'));
      });

      expect(screen.getByTestId('booking-review-section')).toBeInTheDocument();
      expect(screen.getByTestId('review-duration')).toHaveTextContent('2 giờ (120 phút)');
      expect(screen.getByTestId('review-estimated-total')).toHaveTextContent('400.000 đ');

      // User returns to edit mode via back button
      await act(async () => {
        fireEvent.click(screen.getByTestId('booking-back-btn'));
      });

      expect(screen.queryByTestId('booking-review-section')).not.toBeInTheDocument();
      expect(screen.getByTestId('customer-booking-form')).toBeInTheDocument();
    });
  });
});
