import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BookingConfirmationPage } from '../pages/BookingConfirmationPage';
import { AuthContext, AuthContextType } from '../context/auth-context-base';
import { bookingApi } from '../services/booking.api';
import type { BookingResult } from '../types/booking';

vi.mock('../services/booking.api', () => ({
  bookingApi: { getBookingById: vi.fn() },
}));

const booking: BookingResult = {
  id: 'booking-1',
  bookingCode: 'CS-20261025-ABCD',
  room: { id: 'room-1', name: 'Phòng Hội Thảo Alpha' } as BookingResult['room'],
  startTime: '2026-10-25T03:00:00.000Z',
  endTime: '2026-10-25T05:00:00.000Z',
  totalAmount: '400000.00',
  checkedInAt: null,
  attendanceTrackingEnabled: true,
  note: null,
  status: 'CONFIRMED',
  paymentStatus: 'UNPAID',
  paymentMethod: null,
};

const auth = (id: string, role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER'): AuthContextType => ({
  token: `token-${id}`,
  principal: { id, role },
  isAuthenticated: true,
  isLoading: false,
  sessionExpired: false,
  clearSessionExpiredNotice: vi.fn(),
  login: vi.fn(),
  applyProfile: vi.fn(),
  logout: vi.fn(),
});

const view = (value: AuthContextType, state?: unknown) => (
  <AuthContext.Provider value={value}>
    <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation/booking-1', state }]}>
      <Routes>
        <Route path="/booking-confirmation/:id" element={<BookingConfirmationPage />} />
      </Routes>
    </MemoryRouter>
  </AuthContext.Provider>
);

describe('Booking confirmation by id (CWB-70)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the booking from the API on refresh/deep link without route state', async () => {
    vi.mocked(bookingApi.getBookingById).mockResolvedValue({
      success: true,
      message: 'OK',
      data: { ...booking, paymentStatus: 'PAID', paymentMethod: 'QR' },
    });
    render(view(auth('customer-1')));

    expect(await screen.findByTestId('booking-confirmation-view')).toHaveTextContent(
      'CS-20261025-ABCD',
    );
    expect(bookingApi.getBookingById).toHaveBeenCalledWith('booking-1', expect.any(AbortSignal));
  });

  it('shows the route-state preview immediately, then the latest server state', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof bookingApi.getBookingById>>) => void;
    vi.mocked(bookingApi.getBookingById).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }),
    );
    render(view(auth('customer-1'), { booking, customerId: 'customer-1' }));

    expect(screen.getByTestId('booking-confirmation-view')).toHaveTextContent('CS-20261025-ABCD');
    resolve({
      success: true,
      message: 'OK',
      data: { ...booking, bookingCode: 'CS-20261025-NEWS' },
    });
    expect(await screen.findAllByText(/CS-20261025-NEWS/, { exact: false })).not.toHaveLength(0);
    expect(screen.getByTestId('booking-confirmation-view')).not.toHaveTextContent(
      'CS-20261025-ABCD',
    );
  });

  it('ignores a preview that belongs to another account', async () => {
    vi.mocked(bookingApi.getBookingById).mockRejectedValue({ response: { status: 404 } });
    render(view(auth('customer-2'), { booking, customerId: 'customer-1' }));

    expect(await screen.findByTestId('confirmation-empty-state')).toBeInTheDocument();
    expect(screen.queryByText('CS-20261025-ABCD')).not.toBeInTheDocument();
  });

  it('shows not-found for 404 (other owner) without suggesting a new booking', async () => {
    vi.mocked(bookingApi.getBookingById).mockRejectedValue({ response: { status: 404 } });
    render(view(auth('customer-1')));

    const empty = await screen.findByTestId('confirmation-empty-state');
    expect(empty).toHaveTextContent('không cần đặt lại');
    expect(empty).not.toHaveTextContent('thực hiện đặt chỗ mới');
    expect(screen.getByTestId('confirmation-fallback-history-btn')).toHaveAttribute(
      'href',
      '/bookings',
    );
  });

  it('offers a retry when loading fails for other reasons', async () => {
    const user = userEvent.setup();
    vi.mocked(bookingApi.getBookingById)
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce({ success: true, message: 'OK', data: booking });
    render(view(auth('customer-1')));

    await user.click(await screen.findByTestId('confirmation-retry'));
    expect(await screen.findByTestId('booking-confirmation-view')).toBeInTheDocument();
  });

  it('refetches for the new account after an account switch', async () => {
    vi.mocked(bookingApi.getBookingById)
      .mockResolvedValueOnce({ success: true, message: 'OK', data: booking })
      .mockRejectedValueOnce({ response: { status: 404 } });
    const { rerender } = render(view(auth('customer-1')));
    expect(await screen.findByTestId('booking-confirmation-view')).toBeInTheDocument();

    rerender(view(auth('customer-2')));

    expect(await screen.findByTestId('confirmation-empty-state')).toBeInTheDocument();
    expect(bookingApi.getBookingById).toHaveBeenCalledTimes(2);
  });

  it('does not load customer bookings for an ADMIN session', async () => {
    render(view(auth('admin-1', 'ADMIN')));

    expect(await screen.findByTestId('confirmation-empty-state')).toBeInTheDocument();
    expect(bookingApi.getBookingById).not.toHaveBeenCalled();
  });
});
