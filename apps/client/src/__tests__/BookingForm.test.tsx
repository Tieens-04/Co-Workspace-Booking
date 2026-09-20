import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BookingForm, BookingFormProps } from '../components/BookingForm';
import { bookingApi } from '../services/booking.api';

vi.mock('../services/booking.api', () => ({
  bookingApi: {
    createBooking: vi.fn(),
  },
}));

describe('BookingForm', () => {
  const defaultProps: BookingFormProps = {
    roomId: 'room-uuid-1',
    roomName: 'Phòng Hội Thảo Alpha',
    roomStatus: 'AVAILABLE',
    pricePerHour: '200000.00',
    isAuthenticated: true,
    userRole: 'CUSTOMER',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props: Partial<BookingFormProps> = {}, route = '/rooms/room-uuid-1') => {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <BookingForm {...defaultProps} {...props} />
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

      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });
      await user.click(submitBtn);

      expect(screen.getByText('Vui lòng chọn thời gian bắt đầu')).toBeInTheDocument();
      expect(screen.getByText('Vui lòng chọn thời gian kết thúc')).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
    });

    it('validates 30-minute slot alignment', async () => {
      const user = userEvent.setup();
      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      // Enter 10:15 (unaligned)
      await user.type(startInput, '2026-10-25T10:15');
      await user.type(endInput, '2026-10-25T11:45');
      await user.click(submitBtn);

      expect(screen.getByText(/Thời gian bắt đầu phải theo mốc 30 phút/i)).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
    });

    it('validates minimum 1 hour duration', async () => {
      const user = userEvent.setup();
      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      // 30 min duration (10:00 -> 10:30)
      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T10:30');
      await user.click(submitBtn);

      expect(screen.getByText('Thời lượng đặt phòng tối thiểu là 1 giờ')).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
    });

    it('validates maximum 4 hours duration', async () => {
      const user = userEvent.setup();
      renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      // 5 hours duration (10:00 -> 15:00)
      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T15:00');
      await user.click(submitBtn);

      expect(screen.getByText('Thời lượng đặt phòng tối đa là 4 giờ')).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
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
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });
      fireEvent.change(noteInput, { target: { value: 'a'.repeat(501) } });

      fireEvent.click(submitBtn);

      expect(screen.getByText('Ghi chú không được vượt quá 500 ký tự')).toBeInTheDocument();
      expect(bookingApi.createBooking).not.toHaveBeenCalled();
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
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T12:00');
      await user.type(noteInput, 'Cần thêm 2 ghế');
      await user.click(submitBtn);

      expect(bookingApi.createBooking).toHaveBeenCalledWith(
        {
          roomId: 'room-uuid-1',
          startTime: new Date('2026-10-25T10:00').toISOString(),
          endTime: new Date('2026-10-25T12:00').toISOString(),
          note: 'Cần thêm 2 ghế',
        },
        expect.any(AbortSignal),
      );

      // Verify success screen
      expect(await screen.findByTestId('booking-success-view')).toBeInTheDocument();
      expect(screen.getByTestId('booking-success-code')).toHaveTextContent('CS-20261025-ABCD');
      expect(screen.getByTestId('booking-success-total')).toHaveTextContent('400.000 đ');
      expect(screen.getByText(/CONFIRMED/)).toBeInTheDocument();
      expect(screen.getByText(/UNPAID/)).toBeInTheDocument();

      // Reset button returns to form
      const resetBtn = screen.getByRole('button', { name: /Đặt thêm khung giờ khác/i });
      await user.click(resetBtn);
      expect(screen.getByRole('button', { name: /Xác nhận đặt phòng/i })).toBeInTheDocument();
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
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T12:00');
      await user.click(submitBtn);

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(
        screen.getByText('Phòng đã có người đặt trong khoảng thời gian này.'),
      ).toBeInTheDocument();

      // Inputs should be preserved
      expect(startInput).toHaveValue('2026-10-25T10:00');
      expect(endInput).toHaveValue('2026-10-25T12:00');
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
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T12:00');
      await user.click(submitBtn);

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
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      await user.type(startInput, '2026-10-25T10:00');
      await user.type(endInput, '2026-10-25T12:00');
      await user.click(submitBtn);

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
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });

      fireEvent.click(submitBtn);

      expect(bookingApi.createBooking).toHaveBeenCalledTimes(1);
      expect(submitBtn).toBeDisabled();
      expect(screen.getByText('Đang gửi yêu cầu đặt...')).toBeInTheDocument();

      // Click again while submitting
      fireEvent.click(submitBtn);
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
      vi.mocked(bookingApi.createBooking).mockImplementation((_payload, signal) => {
        capturedSignal = signal;
        return new Promise(() => {}); // never resolves
      });

      const { unmount } = renderComponent();

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });
      fireEvent.click(submitBtn);

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal!.aborted).toBe(false);

      unmount();

      expect(capturedSignal!.aborted).toBe(true);
    });

    it('resets form and aborts pending request when roomId changes', async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.mocked(bookingApi.createBooking).mockImplementation((_payload, signal) => {
        capturedSignal = signal;
        return new Promise(() => {});
      });

      const { rerender } = render(
        <MemoryRouter>
          <BookingForm {...defaultProps} roomId="room-uuid-1" />
        </MemoryRouter>,
      );

      const startInput = screen.getByLabelText(/Thời gian bắt đầu/i);
      const endInput = screen.getByLabelText(/Thời gian kết thúc/i);
      const noteInput = screen.getByLabelText(/Ghi chú/i);
      const submitBtn = screen.getByRole('button', { name: /Xác nhận đặt phòng/i });

      fireEvent.change(startInput, { target: { value: '2026-10-25T10:00' } });
      fireEvent.change(endInput, { target: { value: '2026-10-25T12:00' } });
      fireEvent.change(noteInput, { target: { value: 'Ghi chú phòng 1' } });
      fireEvent.click(submitBtn);

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal!.aborted).toBe(false);

      // Change roomId prop
      rerender(
        <MemoryRouter>
          <BookingForm {...defaultProps} roomId="room-uuid-2" />
        </MemoryRouter>,
      );

      expect(capturedSignal!.aborted).toBe(true);
      expect(screen.getByLabelText(/Thời gian bắt đầu/i)).toHaveValue('');
      expect(screen.getByLabelText(/Thời gian kết thúc/i)).toHaveValue('');
      expect(screen.getByLabelText(/Ghi chú/i)).toHaveValue('');
    });
  });
});
