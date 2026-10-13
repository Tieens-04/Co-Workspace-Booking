import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AdminDashboardPage } from '../pages/AdminDashboardPage';
import { adminDashboardApi } from '../services/admin-dashboard.api';
import { AuthContext } from '../context/auth-context-base';

vi.mock('../services/admin-dashboard.api');

const mockPrincipal = {
  id: 'admin-1',
  email: 'admin@cospace.local',
  fullName: 'Quản Trị Viên',
  role: 'ADMIN' as const,
};

const mockKpiDayData = {
  period: {
    type: 'day' as const,
    date: '2026-10-14',
    startDate: '2026-10-13T17:00:00.000Z',
    endDate: '2026-10-14T17:00:00.000Z',
  },
  todayBookingsCount: 8,
  periodBookingsCount: 8,
  occupancyRate: 42.5,
  totalRoomMinutes: 2880,
  bookedMinutes: 1224,
  actualRevenue: '1200000.00',
  potentialRevenue: '1500000.00',
  unpaidRevenue: '300000.00',
  statusBreakdown: {
    confirmed: 4,
    completed: 3,
    cancelled: 1,
    noShow: 0,
  },
  paidBookingsCount: 6,
  unpaidBookingsCount: 1,
};

const mockKpiWeekData = {
  period: {
    type: 'week' as const,
    date: '2026-10-14',
    startDate: '2026-10-11T17:00:00.000Z',
    endDate: '2026-10-18T17:00:00.000Z',
  },
  todayBookingsCount: 8,
  periodBookingsCount: 35,
  occupancyRate: 38.0,
  totalRoomMinutes: 20160,
  bookedMinutes: 7660,
  actualRevenue: '6500000.00',
  potentialRevenue: '8000000.00',
  unpaidRevenue: '1500000.00',
  statusBreakdown: {
    confirmed: 18,
    completed: 14,
    cancelled: 3,
    noShow: 0,
  },
  paidBookingsCount: 30,
  unpaidBookingsCount: 2,
};

const mockScheduleData = {
  date: '2026-10-14',
  rooms: [
    {
      id: 'room-1',
      name: 'Deluxe Creative Room',
      capacity: 6,
      pricePerHour: '200000.00',
      status: 'AVAILABLE' as const,
      slots: [
        {
          startTime: '2026-10-14T02:00:00.000Z',
          endTime: '2026-10-14T02:30:00.000Z',
          status: 'AVAILABLE' as const,
        },
        {
          startTime: '2026-10-14T02:30:00.000Z',
          endTime: '2026-10-14T03:00:00.000Z',
          status: 'BOOKED' as const,
        },
      ],
      bookings: [
        {
          id: 'booking-1',
          bookingCode: 'CS-20261014-ABCD',
          startTime: '2026-10-14T02:30:00.000Z',
          endTime: '2026-10-14T04:30:00.000Z',
          status: 'CONFIRMED' as const,
          customerName: 'Nguyễn Văn A',
        },
      ],
    },
    {
      id: 'room-2',
      name: 'Conference Room B',
      capacity: 15,
      pricePerHour: '400000.00',
      status: 'MAINTENANCE' as const,
      slots: [],
      bookings: [],
    },
  ],
};

const renderWithContext = () => {
  return render(
    <BrowserRouter>
      <AuthContext.Provider
        value={{
          token: 'mock-token',
          principal: mockPrincipal,
          isAuthenticated: true,
          isLoading: false,
          sessionExpired: false,
          clearSessionExpiredNotice: vi.fn(),
          login: vi.fn(),
          logout: vi.fn(),
        }}
      >
        <AdminDashboardPage />
      </AuthContext.Provider>
    </BrowserRouter>,
  );
};

describe('AdminDashboardPage Component Tests (CWB-32)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(adminDashboardApi.getDashboardKpi).mockResolvedValue({
      success: true,
      message: 'OK',
      data: mockKpiDayData,
    });
    vi.mocked(adminDashboardApi.getDashboardSchedule).mockResolvedValue({
      success: true,
      message: 'OK',
      data: mockScheduleData,
    });
  });

  it('renders dashboard KPI metrics and room schedule overview successfully', async () => {
    renderWithContext();

    expect(screen.getByText(/Đang tải dữ liệu dashboard/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('kpi-today-bookings')).toBeInTheDocument();
    });

    // Check KPI values
    expect(screen.getByTestId('kpi-today-bookings')).toHaveTextContent('8');
    expect(screen.getByTestId('kpi-occupancy-rate')).toHaveTextContent('42.5%');
    expect(screen.getByTestId('kpi-actual-revenue')).toHaveTextContent('1.200.000');

    // Check room schedule overview
    expect(screen.getByText('Deluxe Creative Room')).toBeInTheDocument();
    expect(screen.getByText('Conference Room B')).toBeInTheDocument();
    expect(screen.getAllByText(/Đang bảo trì/i).length).toBeGreaterThanOrEqual(1);
  });

  it('switches between Day and Week period filters and fetches updated KPI metrics', async () => {
    renderWithContext();

    await waitFor(() => {
      expect(screen.getByTestId('kpi-today-bookings')).toBeInTheDocument();
    });

    vi.mocked(adminDashboardApi.getDashboardKpi).mockResolvedValueOnce({
      success: true,
      message: 'OK',
      data: mockKpiWeekData,
    });

    const weekButton = screen.getByTestId('filter-period-week-btn');
    fireEvent.click(weekButton);

    await waitFor(() => {
      expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledWith(
        expect.objectContaining({ period: 'week' }),
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('kpi-actual-revenue')).toHaveTextContent('6.500.000');
    });
  });

  it('handles error state and provides a retry button', async () => {
    vi.mocked(adminDashboardApi.getDashboardKpi).mockRejectedValueOnce(
      new Error('Lỗi kết nối máy chủ KPI'),
    );

    renderWithContext();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/Lỗi kết nối máy chủ KPI/i)).toBeInTheDocument();

    vi.mocked(adminDashboardApi.getDashboardKpi).mockResolvedValueOnce({
      success: true,
      message: 'OK',
      data: mockKpiDayData,
    });

    const retryBtn = screen.getByTestId('dashboard-retry-btn');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('kpi-today-bookings')).toBeInTheDocument();
    });
  });
});
