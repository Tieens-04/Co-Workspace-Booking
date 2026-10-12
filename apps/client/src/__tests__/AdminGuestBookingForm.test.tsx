import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminGuestBookingForm } from '../components/AdminGuestBookingForm';
import { roomApi } from '../services/room.api';
import { adminBookingApi } from '../services/admin-booking.api';
import { RoomListItem, RoomAvailabilitySlot } from '../types/room';
import { AdminBookingItem } from '../types/admin-booking';
import {
  formatVnDate,
  formatVnDateTimeLocal,
  getCoveredVnDates,
  getVietnamTodayString,
} from '../utils/bookingTime';

vi.mock('../services/room.api', () => ({
  roomApi: {
    getRooms: vi.fn(),
    getAvailability: vi.fn(),
  },
}));

vi.mock('../services/admin-booking.api', () => ({
  adminBookingApi: {
    createGuestBooking: vi.fn(),
  },
}));

const mockRooms: RoomListItem[] = [
  {
    id: 'room-uuid-1',
    name: 'Phòng Hội Thảo Alpha',
    capacity: 12,
    pricePerHour: '200.00',
    status: 'AVAILABLE',
    coverImage: null,
    amenities: [],
  },
  {
    id: 'room-uuid-2',
    name: 'Phòng Bảo Trì Beta',
    capacity: 4,
    pricePerHour: '100.00',
    status: 'MAINTENANCE',
    coverImage: null,
    amenities: [],
  },
];

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

describe('AdminGuestBookingForm Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(roomApi.getRooms).mockResolvedValue({
      success: true,
      message: 'OK',
      data: {
        items: mockRooms,
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
      },
    });
    vi.mocked(roomApi.getAvailability).mockImplementation(async (rId, date) => ({
      success: true,
      message: 'OK',
      data: {
        roomId: rId,
        date: date as string,
        timezone: 'Asia/Ho_Chi_Minh',
        slots: create48Slots(date as string),
      },
    }));
  });

  const renderComponent = (props?: {
    isOpen?: boolean;
    onToggleOpen?: () => void;
    onBookingCreated?: (b: AdminBookingItem) => void;
    principalId?: string;
  }) => {
    return render(
      <AdminGuestBookingForm
        isOpen={props?.isOpen ?? true}
        onToggleOpen={props?.onToggleOpen ?? vi.fn()}
        onBookingCreated={props?.onBookingCreated}
        principalId={props?.principalId}
      />,
    );
  };

  it('renders contact fields, room selector, and disables MAINTENANCE rooms', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('guest-room-select')).toBeInTheDocument();
    });

    expect(screen.getByTestId('guest-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('guest-phone-input')).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    // First option: -- Chọn phòng --
    // Second option: Alpha (AVAILABLE, enabled)
    // Third option: Beta (MAINTENANCE, disabled)
    expect(options).toHaveLength(3);
    expect(options[1]).toHaveTextContent('Phòng Hội Thảo Alpha');
    expect(options[1]).not.toBeDisabled();
    expect(options[2]).toHaveTextContent(/Phòng Bảo Trì Beta.*Đang bảo trì/);
    expect(options[2]).toBeDisabled();
  });

  it('validates required fields and shows error messages when submitted empty', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('guest-submit-btn')).toBeInTheDocument();
    });

    const submitBtn = screen.getByTestId('guest-submit-btn');
    await user.click(submitBtn);

    expect(screen.getByText('Tên khách hàng không được để trống')).toBeInTheDocument();
    expect(screen.getByText('Số điện thoại không được để trống')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng chọn phòng làm việc')).toBeInTheDocument();
  });

  it('submits valid guest booking payload and displays success summary', async () => {
    const slot = getFutureSlot(4, 2);
    const mockCreatedBooking: AdminBookingItem = {
      id: 'created-guest-id-1',
      bookingCode: 'CS-20261003-WXYZ',
      room: {
        id: 'room-uuid-1',
        name: 'Phòng Hội Thảo Alpha',
      },
      startTime: slot.startDate.toISOString(),
      endTime: slot.endDate.toISOString(),
      totalAmount: '400000.00',
      note: 'Khách vãng lai VIP',
      status: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      paymentMethod: null,
      customer: {
        kind: 'GUEST',
        name: 'Nguyễn Văn Vãng Lai',
        phone: '0912345678',
      },
    };

    vi.mocked(adminBookingApi.createGuestBooking).mockResolvedValueOnce({
      success: true,
      message: 'Đặt phòng cho khách vãng lai thành công',
      data: mockCreatedBooking,
    });

    const onBookingCreated = vi.fn();
    const user = userEvent.setup();
    renderComponent({ onBookingCreated });

    await waitFor(() => {
      expect(screen.getByTestId('guest-room-select')).toBeInTheDocument();
    });

    // Fill contact
    await user.type(screen.getByTestId('guest-name-input'), 'Nguyễn Văn Vãng Lai');
    await user.type(screen.getByTestId('guest-phone-input'), '0912345678');

    // Select room
    await user.selectOptions(screen.getByTestId('guest-room-select'), 'room-uuid-1');

    // Fill start and end times
    await waitFor(() => {
      expect(screen.getByTestId('guest-start-time-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('guest-start-time-input'), {
      target: { value: slot.startTime },
    });
    fireEvent.change(screen.getByTestId('guest-end-time-input'), {
      target: { value: slot.endTime },
    });

    // Fill note
    await user.type(screen.getByTestId('guest-note-input'), 'Khách vãng lai VIP');

    // Submit
    const submitBtn = screen.getByTestId('guest-submit-btn');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('guest-booking-success-box')).toBeInTheDocument();
    });

    expect(screen.getByText('CS-20261003-WXYZ')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Văn Vãng Lai')).toBeInTheDocument();
    expect(onBookingCreated).toHaveBeenCalledWith(mockCreatedBooking);

    // Assert exact arguments passed to createGuestBooking
    expect(adminBookingApi.createGuestBooking).toHaveBeenCalledWith(
      {
        roomId: 'room-uuid-1',
        startTime: slot.startDate.toISOString(),
        endTime: slot.endDate.toISOString(),
        guestName: 'Nguyễn Văn Vãng Lai',
        guestPhone: '0912345678',
        note: 'Khách vãng lai VIP',
      },
      expect.any(AbortSignal),
    );
  });

  it('handles 409 BOOKING_CONFLICT by showing conflict error and refreshing availability', async () => {
    const slot = getFutureSlot(4, 2);

    vi.mocked(adminBookingApi.createGuestBooking).mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: 'BOOKING_CONFLICT',
          message: 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác.',
        },
      },
    });

    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('guest-room-select')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('guest-name-input'), 'Khách B');
    await user.type(screen.getByTestId('guest-phone-input'), '0988776655');
    await user.selectOptions(screen.getByTestId('guest-room-select'), 'room-uuid-1');

    await waitFor(() => {
      expect(screen.getByTestId('guest-start-time-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('guest-start-time-input'), {
      target: { value: slot.startTime },
    });
    fireEvent.change(screen.getByTestId('guest-end-time-input'), {
      target: { value: slot.endTime },
    });

    // Wait for availability to finish loading so submit button is enabled
    await waitFor(() => {
      expect(screen.getByTestId('guest-submit-btn')).not.toBeDisabled();
    });

    const callsBeforeSubmit = vi.mocked(roomApi.getAvailability).mock.calls.length;

    const submitBtn = screen.getByTestId('guest-submit-btn');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('guest-booking-error-general')).toBeInTheDocument();
    });

    expect(screen.getByText(/Khung giờ này đã có người đặt/i)).toBeInTheDocument();

    // Verify availability was refreshed after conflict for all covered dates (N1 Regression)
    const coveredDates = getCoveredVnDates(slot.startDate, slot.endDate);
    await waitFor(() => {
      const callsAfterSubmit = vi
        .mocked(roomApi.getAvailability)
        .mock.calls.slice(callsBeforeSubmit);
      expect(callsAfterSubmit.length).toBeGreaterThanOrEqual(coveredDates.length);
      const refreshedDates = callsAfterSubmit.map((c) => c[1]);
      for (const d of coveredDates) {
        expect(refreshedDates).toContain(d);
      }
    });
  });

  it('handles 409 BOOKING_CONFLICT for overnight booking spanning across midnight (N1 Regression)', async () => {
    // Explicit overnight slot spanning across midnight: 23:00 to 01:00 next day
    const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowStr = formatVnDate(baseDate);
    const dayAfterStr = formatVnDate(new Date(baseDate.getTime() + 24 * 60 * 60 * 1000));
    const startIsoLocal = `${tomorrowStr}T23:00`;
    const endIsoLocal = `${dayAfterStr}T01:00`;

    vi.mocked(adminBookingApi.createGuestBooking).mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: 'BOOKING_CONFLICT',
          message: 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác.',
        },
      },
    });

    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('guest-room-select')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('guest-name-input'), 'Khách Đêm');
    await user.type(screen.getByTestId('guest-phone-input'), '0988776655');
    await user.selectOptions(screen.getByTestId('guest-room-select'), 'room-uuid-1');

    await waitFor(() => {
      expect(screen.getByTestId('guest-start-time-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('guest-start-time-input'), {
      target: { value: startIsoLocal },
    });
    fireEvent.change(screen.getByTestId('guest-end-time-input'), {
      target: { value: endIsoLocal },
    });

    // Wait for availability of both covered dates to finish loading
    await waitFor(() => {
      expect(screen.getByTestId('guest-submit-btn')).not.toBeDisabled();
    });

    const callsBeforeSubmit = vi.mocked(roomApi.getAvailability).mock.calls.length;

    await user.click(screen.getByTestId('guest-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('guest-booking-error-general')).toBeInTheDocument();
    });

    expect(screen.getByText(/Khung giờ này đã có người đặt/i)).toBeInTheDocument();

    // Verify availability was refreshed after conflict for BOTH tomorrow and dayAfter dates
    await waitFor(() => {
      const callsAfterSubmit = vi
        .mocked(roomApi.getAvailability)
        .mock.calls.slice(callsBeforeSubmit);
      expect(callsAfterSubmit.length).toBeGreaterThanOrEqual(2);
      const refreshedDates = callsAfterSubmit.map((c) => c[1]);
      expect(refreshedDates).toContain(tomorrowStr);
      expect(refreshedDates).toContain(dayAfterStr);
    });
  });

  it('resets form and clears previous session state when principalId changes (F2 Regression)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AdminGuestBookingForm isOpen={true} onToggleOpen={vi.fn()} principalId="admin-session-1" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('guest-room-select')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('guest-name-input'), 'Draft Name A');
    await user.type(screen.getByTestId('guest-phone-input'), '0911223344');
    await user.selectOptions(screen.getByTestId('guest-room-select'), 'room-uuid-1');

    expect(screen.getByTestId('guest-name-input')).toHaveValue('Draft Name A');
    expect(screen.getByTestId('guest-phone-input')).toHaveValue('0911223344');
    expect(screen.getByTestId('guest-room-select')).toHaveValue('room-uuid-1');

    // Admin switches account
    rerender(
      <AdminGuestBookingForm isOpen={true} onToggleOpen={vi.fn()} principalId="admin-session-2" />,
    );

    // Form inputs and selection must be reset to protect previous session draft
    expect(screen.getByTestId('guest-name-input')).toHaveValue('');
    expect(screen.getByTestId('guest-phone-input')).toHaveValue('');
    expect(screen.getByTestId('guest-room-select')).toHaveValue('');
  });

  it('aborts in-flight request and suppresses submission if admin session switches during preflight (F2 Regression)', async () => {
    const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowStr = formatVnDate(baseDate);
    const startIsoLocal = `${tomorrowStr}T10:00`;
    const endIsoLocal = `${tomorrowStr}T12:00`;

    let isInitialLoaded = false;
    let preflightSignal: AbortSignal | undefined;
    let resolvePreflight: (value: any) => void;
    const preflightPromise = new Promise((resolve) => {
      resolvePreflight = resolve;
    });

    vi.mocked(roomApi.getAvailability).mockImplementation(async (rId, date, signal) => {
      if (!isInitialLoaded) {
        return {
          success: true,
          message: 'OK',
          data: {
            roomId: rId,
            date: date as string,
            timezone: 'Asia/Ho_Chi_Minh',
            slots: create48Slots(date as string),
          },
        };
      }
      preflightSignal = signal;
      return preflightPromise as any;
    });

    const user = userEvent.setup();
    const { rerender } = render(
      <AdminGuestBookingForm isOpen={true} onToggleOpen={vi.fn()} principalId="admin-session-1" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('guest-room-select')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('guest-name-input'), 'Guest of Admin 1');
    await user.type(screen.getByTestId('guest-phone-input'), '0911223344');
    await user.selectOptions(screen.getByTestId('guest-room-select'), 'room-uuid-1');

    await waitFor(() => {
      expect(screen.getByTestId('guest-start-time-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('guest-start-time-input'), {
      target: { value: startIsoLocal },
    });
    fireEvent.change(screen.getByTestId('guest-end-time-input'), {
      target: { value: endIsoLocal },
    });

    // Wait for initial availability to load and submit button to be enabled
    await waitFor(() => {
      expect(screen.getByTestId('guest-submit-btn')).not.toBeDisabled();
    });

    // Enable preflight interception
    isInitialLoaded = true;

    // Click submit in session 1
    await user.click(screen.getByTestId('guest-submit-btn'));

    // Verify preflight actually started and captured signal
    await waitFor(() => {
      expect(preflightSignal).toBeDefined();
    });
    expect(preflightSignal?.aborted).toBe(false);

    // Admin switches to session 2 while preflight is in flight
    rerender(
      <AdminGuestBookingForm isOpen={true} onToggleOpen={vi.fn()} principalId="admin-session-2" />,
    );

    // Verify preflight signal was aborted by session switch cleanup
    expect(preflightSignal?.aborted).toBe(true);

    // Resolve preflight from session 1
    resolvePreflight!({
      success: true,
      message: 'OK',
      data: {
        roomId: 'room-uuid-1',
        date: tomorrowStr,
        timezone: 'Asia/Ho_Chi_Minh',
        slots: create48Slots(tomorrowStr),
      },
    });

    // Wait a tick
    await new Promise((r) => setTimeout(r, 50));

    // Must NOT have executed createGuestBooking under the new session
    expect(adminBookingApi.createGuestBooking).not.toHaveBeenCalled();
  });

  it('displays error message and retry button when room fetch fails, and recovers on retry (F3 Regression)', async () => {
    vi.mocked(roomApi.getRooms).mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('guest-rooms-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('guest-retry-rooms-btn')).toBeInTheDocument();

    // Now allow rooms fetch to succeed on retry
    vi.mocked(roomApi.getRooms).mockResolvedValueOnce({
      success: true,
      message: 'OK',
      data: {
        items: mockRooms,
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
      },
    });

    await user.click(screen.getByTestId('guest-retry-rooms-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('guest-rooms-error')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Phòng Hội Thảo Alpha.*200.*12 người/)).toBeInTheDocument();
  });

  it('displays error message and retry button when availability fetch fails, and disables submit button (F3 Regression)', async () => {
    vi.mocked(roomApi.getAvailability).mockRejectedValueOnce(
      new Error('Failed to load availability slots'),
    );
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('guest-room-select')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByTestId('guest-room-select'), 'room-uuid-1');

    await waitFor(() => {
      expect(screen.getByTestId('guest-availability-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('guest-retry-availability-btn')).toBeInTheDocument();

    // Submit button must be disabled while availability has error
    expect(screen.getByTestId('guest-submit-btn')).toBeDisabled();

    const todayStr = getVietnamTodayString();

    // Mock successful availability retry
    vi.mocked(roomApi.getAvailability).mockResolvedValueOnce({
      success: true,
      message: 'OK',
      data: {
        roomId: 'room-uuid-1',
        date: todayStr,
        timezone: 'Asia/Ho_Chi_Minh',
        slots: create48Slots(todayStr),
      },
    });

    await user.click(screen.getByTestId('guest-retry-availability-btn'));

    // Assert error alert disappears AND loading state clears
    await waitFor(() => {
      expect(screen.queryByTestId('guest-availability-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('guest-availability-loading')).not.toBeInTheDocument();
    });

    // Select valid time and verify submit button becomes enabled, proving recovery is complete
    fireEvent.change(screen.getByTestId('guest-start-time-input'), {
      target: { value: `${todayStr}T10:00` },
    });
    fireEvent.change(screen.getByTestId('guest-end-time-input'), {
      target: { value: `${todayStr}T12:00` },
    });

    await waitFor(() => {
      expect(screen.getByTestId('guest-submit-btn')).not.toBeDisabled();
    });
  });
});
