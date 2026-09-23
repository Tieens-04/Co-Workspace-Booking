import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, BrowserRouter, useNavigate, useLocation } from 'react-router-dom';
import { BookingConfirmationPage } from '../pages/BookingConfirmationPage';
import { isValidBookingResult } from '../utils/history';
import { CustomerRoute } from '../components/RouteGuard';
import { BookingResult } from '../types/booking';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../hooks/useAuth';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';

describe('BookingConfirmationPage', () => {
  const mockBookingResult: BookingResult = {
    id: 'booking-res-123',
    bookingCode: 'CS-20261025-ABCD',
    room: {
      id: 'room-uuid-1',
      name: 'Phòng Hội Thảo Alpha',
    },
    startTime: '2026-10-25T03:00:00.000Z', // 10:00:00 VN (+07:00)
    endTime: '2026-10-25T05:00:00.000Z',   // 12:00:00 VN (+07:00)
    totalAmount: '400000.00',
    note: 'Cần chuẩn bị máy chiếu và bảng trắng',
    status: 'CONFIRMED',
    paymentStatus: 'UNPAID',
    paymentMethod: null,
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'customer-1', role: 'CUSTOMER' }));
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = (state?: unknown) => {
    return render(
      <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state }]}>
        <AuthProvider>
          <Routes>
            <Route path="/booking-confirmation" element={<BookingConfirmationPage />} />
            <Route path="/" element={<div>Mock Home Page</div>} />
            <Route path="/rooms/:id" element={<div>Mock Room Detail</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  };

  describe('AC2: Booking Code & Payment Instruction at Counter', () => {
    it('renders booking confirmation screen with code, room, time, total, and instruction at counter when state is { booking, customerId }', () => {
      renderComponent({ booking: mockBookingResult, customerId: 'customer-1' });

      expect(screen.getByTestId('booking-confirmation-view')).toBeInTheDocument();
      expect(screen.getByTestId('booking-confirmation-code')).toHaveTextContent('CS-20261025-ABCD');
      expect(screen.getByTestId('booking-confirmation-room')).toHaveTextContent(
        'Phòng Hội Thảo Alpha',
      );
      expect(screen.getByTestId('booking-confirmation-note')).toHaveTextContent(
        'Cần chuẩn bị máy chiếu và bảng trắng',
      );
      expect(screen.getByTestId('booking-confirmation-total')).toHaveTextContent('400.000 đ');
      expect(screen.getByTestId('booking-confirmation-status')).toHaveTextContent('CONFIRMED');
      expect(screen.getByTestId('booking-confirmation-payment')).toHaveTextContent('UNPAID');

      // Assert actual Vietnam datetime formatting
      const timeDisplay = screen.getByTestId('booking-confirmation-time').textContent;
      expect(timeDisplay).toContain('2026');
      expect(timeDisplay).toContain('10:00');
      expect(timeDisplay).toContain('12:00');

      // Check payment instruction at counter (AC2 requirement)
      const paymentInstruction = screen.getByTestId('booking-payment-instruction');
      expect(paymentInstruction).toBeInTheDocument();
      expect(paymentInstruction).toHaveTextContent(/thanh toán tại quầy/i);

      // Check action links
      const backRoomLink = screen.getByTestId('confirmation-back-room-btn');
      expect(backRoomLink).toHaveAttribute('href', '/rooms/room-uuid-1');

      const backHomeLink = screen.getByTestId('confirmation-back-home-btn');
      expect(backHomeLink).toHaveAttribute('href', '/');
    });

    it('renders correctly when booking result is passed directly in router state with customerId', () => {
      renderComponent({ ...mockBookingResult, customerId: 'customer-1' });

      expect(screen.getByTestId('booking-confirmation-view')).toBeInTheDocument();
      expect(screen.getByTestId('booking-confirmation-code')).toHaveTextContent('CS-20261025-ABCD');
      expect(screen.getByTestId('booking-payment-instruction')).toHaveTextContent(
        /thanh toán tại quầy/i,
      );
    });

    it('renders "Không có" when note is null or empty', () => {
      renderComponent({
        booking: {
          ...mockBookingResult,
          note: null,
        },
        customerId: 'customer-1',
      });

      expect(screen.getByTestId('booking-confirmation-note')).toHaveTextContent('Không có');
    });
  });

  describe('Finding 1: Session & Customer Ownership Isolation', () => {
    it('renders fallback empty state and hides booking data when user is unauthenticated (logged out / guest)', () => {
      localStorage.clear();
      renderComponent({ booking: mockBookingResult, customerId: 'customer-1' });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
      expect(screen.queryByText('CS-20261025-ABCD')).not.toBeInTheDocument();
      expect(screen.queryByText(/thanh toán tại quầy/i)).not.toBeInTheDocument();
    });

    it('renders fallback empty state when accessed by a different customer (customer-2)', () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'customer-2', role: 'CUSTOMER' }));
      renderComponent({ booking: mockBookingResult, customerId: 'customer-1' });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
      expect(screen.queryByText('CS-20261025-ABCD')).not.toBeInTheDocument();
    });

    it('renders fallback empty state when accessed by an ADMIN role', () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'admin-1', role: 'ADMIN' }));
      renderComponent({ booking: mockBookingResult, customerId: 'customer-1' });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
      expect(screen.queryByText('CS-20261025-ABCD')).not.toBeInTheDocument();
    });

    it('sanitizes window.history.state while strictly preserving router metadata (idx, key) on unauthorized access', () => {
      const initialHistoryState = {
        idx: 2,
        key: 'unauth-key-1',
        usr: { booking: mockBookingResult, customerId: 'customer-1' },
      };
      window.history.replaceState(initialHistoryState, '');

      localStorage.clear(); // unauthenticated
      renderComponent({ booking: mockBookingResult, customerId: 'customer-1' });

      expect(window.history.state).toEqual({
        idx: 2,
        key: 'unauth-key-1',
        usr: null,
      });
      expect(window.history.state.idx).toBe(2);
      expect(window.history.state.key).toBe('unauth-key-1');
      expect(window.history.state.usr).toBeNull();
    });

    it('sanitizes window.history.state on mount of valid booking while preserving router metadata', () => {
      const initialHistoryState = {
        idx: 1,
        key: 'auth-key-1',
        usr: { booking: mockBookingResult, customerId: 'customer-1' },
      };
      window.history.replaceState(initialHistoryState, '');

      renderComponent({ booking: mockBookingResult, customerId: 'customer-1' });

      // Booking details rendered on screen
      expect(screen.getByTestId('booking-confirmation-view')).toBeInTheDocument();
      expect(screen.getByTestId('booking-confirmation-code')).toHaveTextContent('CS-20261025-ABCD');

      // But history state usr is already sanitized to null
      expect(window.history.state).toEqual({
        idx: 1,
        key: 'auth-key-1',
        usr: null,
      });
      expect(window.history.state.usr).toBeNull();
    });
  });

  describe('Finding 1 & 2: Browser Integration (Metadata preservation & Logout history protection)', () => {
    it('preserves idx and key metadata on fallback so next navigation does not produce NaN', async () => {
      window.history.replaceState({ idx: 1, key: 'k1', usr: null }, '', '/booking-confirmation');

      render(
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/booking-confirmation" element={<BookingConfirmationPage />} />
              <Route path="/" element={<div data-testid="home-page">Home Page</div>} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>,
      );

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(window.history.state?.idx).toBe(1);
      expect(window.history.state?.key).toBe('k1');

      // Click "Về danh sách phòng"
      const backHomeBtn = screen.getByTestId('confirmation-back-home-btn');
      fireEvent.click(backHomeBtn);

      expect(await screen.findByTestId('home-page')).toBeInTheDocument();
      // Crucial: next index must be 2, strictly NOT NaN
      expect(window.history.state?.idx).toBe(2);
      expect(Number.isNaN(window.history.state?.idx)).toBe(false);
    });

    it('clears booking data from history entry so navigating away and logging out leaves no BookingResult', async () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'customer-1', role: 'CUSTOMER' }));

      window.history.replaceState({ idx: 0, key: 'root', usr: null }, '', '/');
      window.history.pushState(
        {
          idx: 1,
          key: 'conf-key',
          usr: {
            booking: mockBookingResult,
            customerId: 'customer-1',
          },
        },
        '',
        '/booking-confirmation',
      );

      const TestApp = () => {
        const { logout } = useAuth();
        return (
          <Routes>
            <Route
              path="/booking-confirmation"
              element={
                <CustomerRoute>
                  <BookingConfirmationPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/"
              element={
                <div>
                  <div data-testid="home-page">Home Page</div>
                  <button data-testid="logout-btn" onClick={() => logout()}>
                    Logout
                  </button>
                </div>
              }
            />
            <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
          </Routes>
        );
      };

      render(
        <BrowserRouter>
          <AuthProvider>
            <TestApp />
          </AuthProvider>
        </BrowserRouter>,
      );

      // Successfully displays booking on screen
      expect(screen.getByTestId('booking-confirmation-code')).toHaveTextContent('CS-20261025-ABCD');

      // But history state entry 1 is sanitized
      expect(window.history.state.usr).toBeNull();
      expect(window.history.state.idx).toBe(1);

      // Navigate to home
      fireEvent.click(screen.getByTestId('confirmation-back-home-btn'));
      expect(await screen.findByTestId('home-page')).toBeInTheDocument();
      expect(window.history.state.idx).toBe(2);

      // Logout
      fireEvent.click(screen.getByTestId('logout-btn'));
      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('preserves destination router state when unmounting and navigating to a route with state', async () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'customer-1', role: 'CUSTOMER' }));

      window.history.replaceState({ idx: 0, key: 'root', usr: null }, '', '/');
      window.history.pushState(
        {
          idx: 1,
          key: 'conf-key',
          usr: {
            booking: mockBookingResult,
            customerId: 'customer-1',
          },
        },
        '',
        '/booking-confirmation',
      );

      const DestinationPage = () => {
        const location = useLocation();
        return (
          <div>
            <div data-testid="destination-page">Destination Page</div>
            <div data-testid="destination-state">{JSON.stringify(location.state)}</div>
          </div>
        );
      };

      const ConfirmationNavWrapper = () => {
        const navigate = useNavigate();
        return (
          <div>
            <BookingConfirmationPage />
            <button
              data-testid="navigate-with-state-btn"
              onClick={() =>
                navigate('/target', {
                  state: { sessionExpired: true, fromTarget: 'confirmed' },
                })
              }
            >
              Navigate to target
            </button>
          </div>
        );
      };

      render(
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/booking-confirmation" element={<ConfirmationNavWrapper />} />
              <Route path="/target" element={<DestinationPage />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>,
      );

      expect(screen.getByTestId('booking-confirmation-code')).toBeInTheDocument();

      // Click to navigate with state to destination
      fireEvent.click(screen.getByTestId('navigate-with-state-btn'));

      expect(await screen.findByTestId('destination-page')).toBeInTheDocument();
      expect(screen.getByTestId('destination-state')).toHaveTextContent('sessionExpired');
      // Crucial: window.history.state.usr of destination entry must NOT be wiped out to null!
      expect(window.history.state?.usr).toEqual({ sessionExpired: true, fromTarget: 'confirmed' });
    });
  });

  describe('Finding 3: Runtime Type Safety & Nested Malformed State', () => {
    it('validates booking with isValidBookingResult type guard correctly', () => {
      expect(isValidBookingResult(mockBookingResult)).toBe(true);
      expect(isValidBookingResult(null)).toBe(false);
      expect(isValidBookingResult('string')).toBe(false);
      expect(isValidBookingResult({})).toBe(false);
    });

    it('renders fallback empty state when booking.note is an object {} without throwing TypeError', () => {
      const malformedBooking = {
        ...mockBookingResult,
        note: {} as unknown as string,
      };

      expect(() => {
        renderComponent({ booking: malformedBooking, customerId: 'customer-1' });
      }).not.toThrow();

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when booking.note is a number 12345 without throwing error', () => {
      const malformedBooking = {
        ...mockBookingResult,
        note: 12345 as unknown as string,
      };

      renderComponent({ booking: malformedBooking, customerId: 'customer-1' });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when startTime is an unparseable invalid date string', () => {
      const malformedBooking = {
        ...mockBookingResult,
        startTime: 'not-a-valid-date',
      };

      renderComponent({ booking: malformedBooking, customerId: 'customer-1' });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when endTime is an unparseable invalid date string', () => {
      const malformedBooking = {
        ...mockBookingResult,
        endTime: 'not-a-valid-date',
      };

      renderComponent({ booking: malformedBooking, customerId: 'customer-1' });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when room is null', () => {
      const malformedBooking = {
        ...mockBookingResult,
        room: null as unknown as { id: string; name: string },
      };

      renderComponent({ booking: malformedBooking, customerId: 'customer-1' });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders empty fallback notice when navigated without state', () => {
      renderComponent(undefined);

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.getByText('Không tìm thấy thông tin đặt phòng')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-code')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirmation-back-home-btn')).toHaveAttribute('href', '/');
    });

    it('renders fallback notice when router state is primitive string "invalid" without throwing TypeError', () => {
      renderComponent('invalid');

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when router state is primitive number 12345 without error', () => {
      renderComponent(12345);

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when router state is primitive boolean true without error', () => {
      renderComponent(true);

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when router state is corrupted or missing essential fields', () => {
      renderComponent({ booking: { id: 'invalid' }, customerId: 'customer-1' });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when bookingCode is missing', () => {
      renderComponent({
        booking: {
          ...mockBookingResult,
          bookingCode: '',
        },
        customerId: 'customer-1',
      });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when room name is missing', () => {
      renderComponent({
        booking: {
          ...mockBookingResult,
          room: { id: 'room-1', name: '' },
        },
        customerId: 'customer-1',
      });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when totalAmount is non-numeric "abc"', () => {
      renderComponent({
        booking: {
          ...mockBookingResult,
          totalAmount: 'abc',
        },
        customerId: 'customer-1',
      });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when totalAmount is negative', () => {
      renderComponent({
        booking: {
          ...mockBookingResult,
          totalAmount: '-50000.00',
        },
        customerId: 'customer-1',
      });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when totalAmount overflows to infinity (e.g. 400 digits) without rendering infinity', () => {
      renderComponent({
        booking: {
          ...mockBookingResult,
          totalAmount: '9'.repeat(400),
        },
        customerId: 'customer-1',
      });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
      expect(screen.queryByText(/∞/)).not.toBeInTheDocument();
    });

    it('renders fallback notice when status is missing or empty string', () => {
      renderComponent({
        booking: {
          ...mockBookingResult,
          status: '',
        },
        customerId: 'customer-1',
      });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });

    it('renders fallback notice when paymentStatus is missing or empty string', () => {
      renderComponent({
        booking: {
          ...mockBookingResult,
          paymentStatus: '',
        },
        customerId: 'customer-1',
      });

      expect(screen.getByTestId('confirmation-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('booking-confirmation-view')).not.toBeInTheDocument();
    });
  });
});
