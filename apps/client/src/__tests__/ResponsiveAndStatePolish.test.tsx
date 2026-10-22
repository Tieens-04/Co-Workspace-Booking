import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoomsPage } from '../pages/RoomsPage';
import { PublicLayout } from '../layouts/PublicLayout';
import { RoomDetailPage } from '../pages/RoomDetailPage';
import { BookingHistoryPage } from '../pages/BookingHistoryPage';
import { AdminDashboardPage } from '../pages/AdminDashboardPage';
import { AdminBookingsPage } from '../pages/AdminBookingsPage';
import { roomApi } from '../services/room.api';
import { bookingApi } from '../services/booking.api';
import { adminDashboardApi } from '../services/admin-dashboard.api';
import { adminBookingApi } from '../services/admin-booking.api';

// Mocks
vi.mock('../services/room.api', () => ({
  roomApi: {
    getRooms: vi.fn(),
    getRoomById: vi.fn(),
    getAmenities: vi.fn(),
    getAvailability: vi.fn(),
  },
}));

vi.mock('../services/booking.api', () => ({
  bookingApi: {
    getBookings: vi.fn(),
    getBookingById: vi.fn(),
    cancelBooking: vi.fn(),
  },
}));

vi.mock('../services/admin-dashboard.api', () => ({
  adminDashboardApi: {
    getDashboardKpi: vi.fn(),
    getDashboardSchedule: vi.fn(),
  },
}));

vi.mock('../services/admin-booking.api', () => ({
  adminBookingApi: {
    getBookings: vi.fn(),
    getRevenue: vi.fn(),
    confirmPayment: vi.fn(),
    completeBooking: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    principal: {
      id: 'user-uuid-1',
      email: 'test@cospace.local',
      fullName: 'Test User',
      role: 'ADMIN',
    },
    logout: vi.fn(),
  }),
}));

describe('UI Polish: Loading, Error, Empty States & Responsive UX (CWB-35)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty States', () => {
    it('RoomsPage renders friendly empty state with clear filters CTA when 0 rooms found', async () => {
      vi.mocked(roomApi.getAmenities).mockResolvedValue({
        success: true,
        message: 'OK',
        data: [],
      });
      vi.mocked(roomApi.getRooms).mockResolvedValue({
        success: true,
        message: 'OK',
        data: {
          items: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        },
      });

      render(
        <MemoryRouter initialEntries={['/rooms']}>
          <RoomsPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Không tìm thấy phòng phù hợp')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Không có không gian làm việc nào đáp ứng tiêu chí tìm kiếm/i),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Xóa bộ lọc/i })).toBeInTheDocument();
    });

    it('BookingHistoryPage renders friendly empty states per tab with link to rooms', async () => {
      vi.mocked(bookingApi.getBookings).mockResolvedValue({
        success: true,
        message: 'OK',
        data: {
          items: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        },
      });

      render(
        <MemoryRouter initialEntries={['/bookings?view=UPCOMING']}>
          <BookingHistoryPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Không có đơn đặt phòng.*sắp tới/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('link', { name: /Khám phá.*phòng/i })).toBeInTheDocument();
    });

    it('AdminBookingsPage renders friendly empty state when no bookings match query', async () => {
      vi.mocked(adminBookingApi.getBookings).mockResolvedValue({
        success: true,
        message: 'OK',
        data: {
          items: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        },
      });
      vi.mocked(adminBookingApi.getRevenue).mockResolvedValue({
        success: true,
        message: 'OK',
        data: {
          period: { startDate: null, endDate: null },
          actualRevenue: '0.00',
          potentialRevenue: '0.00',
          unpaidRevenue: '0.00',
          paidBookings: 0,
          unpaidBookings: 0,
          totalBookings: 0,
          cancelledBookings: 0,
        },
      });

      render(
        <MemoryRouter initialEntries={['/admin/bookings']}>
          <AdminBookingsPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('admin-bookings-empty')).toBeInTheDocument();
      });

      expect(screen.getByText('Không tìm thấy đơn đặt phòng')).toBeInTheDocument();
    });
  });

  describe('Skeleton Loading & Layout Shift Prevention', () => {
    it('RoomsPage renders room-grid skeleton cards during initial fetch without layout collapse', () => {
      vi.mocked(roomApi.getAmenities).mockReturnValue(new Promise(() => {}));
      vi.mocked(roomApi.getRooms).mockReturnValue(new Promise(() => {}));

      render(
        <MemoryRouter initialEntries={['/rooms']}>
          <RoomsPage />
        </MemoryRouter>,
      );

      const skeletonGrid = screen.getByLabelText('Đang nạp danh sách phòng');
      expect(skeletonGrid).toBeInTheDocument();
      const skeletons = within(skeletonGrid).getAllByTestId('room-card-skeleton');
      expect(skeletons.length).toBe(6);
    });

    it('RoomDetailPage renders skeleton container matching layout classes', () => {
      vi.mocked(roomApi.getRoomById).mockReturnValue(new Promise(() => {}));

      render(
        <MemoryRouter initialEntries={['/rooms/11111111-1111-4111-8111-111111111111']}>
          <Routes>
            <Route path="/rooms/:id" element={<RoomDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );

      const skeleton = screen.getByLabelText('Đang tải thông tin phòng');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
    });

    it('AdminDashboardPage renders structured KPI skeleton cards preventing layout shift', () => {
      vi.mocked(adminDashboardApi.getDashboardKpi).mockReturnValue(new Promise(() => {}));
      vi.mocked(adminDashboardApi.getDashboardSchedule).mockReturnValue(new Promise(() => {}));

      render(
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <AdminDashboardPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('dashboard-kpi-skeleton')).toBeInTheDocument();
      const skeletonKpis = screen.getAllByTestId('kpi-skeleton-card');
      expect(skeletonKpis.length).toBe(4);
    });

    it('AdminBookingsPage renders structured table skeleton rows preventing layout shift', () => {
      vi.mocked(adminBookingApi.getBookings).mockReturnValue(new Promise(() => {}));
      vi.mocked(adminBookingApi.getRevenue).mockReturnValue(new Promise(() => {}));

      render(
        <MemoryRouter initialEntries={['/admin/bookings']}>
          <AdminBookingsPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('admin-bookings-table-skeleton')).toBeInTheDocument();
      const rows = screen.getAllByTestId('admin-booking-skeleton-row');
      expect(rows.length).toBe(5);
    });
  });

  describe('Friendly Error States & Retry', () => {
    it('RoomsPage displays friendly error with retry button on network failure', async () => {
      vi.mocked(roomApi.getAmenities).mockResolvedValue({
        success: true,
        message: 'OK',
        data: [],
      });
      vi.mocked(roomApi.getRooms).mockRejectedValueOnce(new Error('Mất kết nối máy chủ'));

      render(
        <MemoryRouter initialEntries={['/rooms']}>
          <RoomsPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Không thể tải danh sách phòng')).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /Thử lại/i });
      expect(retryBtn).toBeInTheDocument();

      vi.mocked(roomApi.getRooms).mockResolvedValueOnce({
        success: true,
        message: 'OK',
        data: {
          items: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        },
      });

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Không tìm thấy phòng phù hợp')).toBeInTheDocument();
      });
    });

    it('AdminDashboardPage displays error banner with retry capability', async () => {
      vi.mocked(adminDashboardApi.getDashboardKpi).mockRejectedValueOnce(new Error('Lỗi tải KPI'));
      vi.mocked(adminDashboardApi.getDashboardSchedule).mockRejectedValueOnce(
        new Error('Lỗi tải Schedule'),
      );

      render(
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <AdminDashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-error-banner')).toBeInTheDocument();
      });

      const retryBtn = screen.getByTestId('dashboard-retry-btn');
      expect(retryBtn).toBeInTheDocument();
    });
  });

  describe('Mobile Responsive Layout & UX (AC: Trang web hiển thị tốt trên màn hình điện thoại)', () => {
    it('RoomsPage renders properly in mobile viewport without broken layout elements', async () => {
      vi.mocked(roomApi.getAmenities).mockResolvedValue({
        success: true,
        message: 'OK',
        data: [],
      });
      vi.mocked(roomApi.getRooms).mockResolvedValue({
        success: true,
        message: 'OK',
        data: {
          items: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        },
      });

      // Simulate mobile window width (375px)
      window.innerWidth = 375;
      window.innerHeight = 667;
      window.dispatchEvent(new Event('resize'));

      render(
        <MemoryRouter initialEntries={['/rooms']}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/rooms" element={<RoomsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Không tìm thấy phòng phù hợp')).toBeInTheDocument();
      });

      const header = screen.getByRole('banner');
      expect(
        within(header).getByRole('navigation', { name: 'Điều hướng chính' }),
      ).toBeInTheDocument();
      expect(within(header).getByRole('button', { name: 'Mở menu' })).toBeInTheDocument();
    });

    it('RoomsPage moves filters from the side rail into a single drawer below the lg breakpoint', async () => {
      vi.mocked(roomApi.getAmenities).mockResolvedValue({ success: true, message: 'OK', data: [] });
      vi.mocked(roomApi.getRooms).mockResolvedValue({
        success: true,
        message: 'OK',
        data: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } },
      });
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query === '(max-width: 1023px)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;

      try {
        render(
          <MemoryRouter initialEntries={['/rooms']}>
            <RoomsPage />
          </MemoryRouter>,
        );

        await waitFor(() => {
          expect(screen.getByText('Không tìm thấy phòng phù hợp')).toBeInTheDocument();
        });
        expect(
          screen.queryByRole('complementary', { name: 'Bộ lọc tìm kiếm phòng' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Sức chứa tối thiểu/i)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Bộ lọc' }));
        const drawer = await screen.findByRole('dialog', { name: 'Bộ lọc tìm kiếm' });
        expect(within(drawer).getAllByLabelText(/Sức chứa tối thiểu/i)).toHaveLength(1);
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });
  });
});
