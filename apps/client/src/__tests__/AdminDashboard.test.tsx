import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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
  summary: { totalRooms: 2, availableRooms: 1, maintenanceRooms: 1 },
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
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
          applyProfile: vi.fn(),
          refreshProfile: vi.fn().mockResolvedValue(undefined),
          clearLocalSession: vi.fn(),
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

  it('uses whole-catalog room counts and pages the schedule (CWB-57)', async () => {
    vi.mocked(adminDashboardApi.getDashboardSchedule).mockResolvedValue({
      success: true,
      message: 'OK',
      data: {
        ...mockScheduleData,
        summary: { totalRooms: 45, availableRooms: 40, maintenanceRooms: 5 },
        pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
      },
    });
    renderWithContext();

    await screen.findByText('45 phòng');
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
      expect.anything(),
    );
    const pager = screen.getByTestId('schedule-pagination');
    expect(pager).toHaveTextContent('Trang 1 / 3');
    fireEvent.click(within(pager).getByRole('button', { name: /Trang sau/i }));
    await waitFor(() =>
      expect(adminDashboardApi.getDashboardSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, limit: 20 }),
        expect.anything(),
      ),
    );
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AdminDashboardPage Independent Loading & Error Isolation (CWB-123)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

  it('paginates schedule without re-fetching KPI, without flashing KPI skeleton, and keeps Pagination disabled while loading', async () => {
    const page1Data = {
      ...mockScheduleData,
      summary: { totalRooms: 45, availableRooms: 40, maintenanceRooms: 5 },
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
    };
    const page2Data = {
      ...page1Data,
      rooms: [
        {
          ...mockScheduleData.rooms[0],
          id: 'room-page-2',
          name: 'Executive Suite Page 2',
        },
      ],
      pagination: { page: 2, limit: 20, total: 45, totalPages: 3 },
    };
    const page2Deferred = createDeferred<{
      success: boolean;
      message: string;
      data: typeof page2Data;
    }>();

    vi.mocked(adminDashboardApi.getDashboardSchedule)
      .mockResolvedValueOnce({ success: true, message: 'OK', data: page1Data })
      .mockReturnValueOnce(page2Deferred.promise);

    renderWithContext();

    await screen.findByText('45 phòng');
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(1);
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(1);

    const pager = screen.getByTestId('schedule-pagination');
    fireEvent.click(within(pager).getByRole('button', { name: /Trang sau/i }));

    // While page 2 is in-flight: KPI stays mounted with roomSummary, schedule shows scoped skeleton, Pagination stays mounted & disabled
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-schedule-skeleton')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('dashboard-kpi-skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-today-bookings')).toHaveTextContent('8');
    expect(screen.getByTestId('kpi-total-rooms')).toHaveTextContent('45 phòng');

    const loadingPager = screen.getByTestId('schedule-pagination');
    expect(loadingPager).toHaveTextContent('Trang 2 / 3');
    expect(within(loadingPager).getByRole('button', { name: /Trang trước/i })).toBeDisabled();
    expect(within(loadingPager).getByRole('button', { name: /Trang sau/i })).toBeDisabled();

    // KPI API must NOT be called again
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(1);
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(2);

    page2Deferred.resolve({ success: true, message: 'OK', data: page2Data });

    await screen.findByText('Executive Suite Page 2');
    expect(screen.queryByTestId('dashboard-schedule-skeleton')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('schedule-pagination')).getByRole('button', { name: /Trang sau/i }),
    ).toBeEnabled();
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(1);
  });

  it('switches KPI period without re-fetching schedule or unmounting RoomOverviewGrid', async () => {
    const weekDeferred = createDeferred<{
      success: boolean;
      message: string;
      data: typeof mockKpiWeekData;
    }>();

    vi.mocked(adminDashboardApi.getDashboardKpi)
      .mockResolvedValueOnce({ success: true, message: 'OK', data: mockKpiDayData })
      .mockReturnValueOnce(weekDeferred.promise);

    renderWithContext();

    await screen.findByTestId('kpi-today-bookings');
    await screen.findByText('Deluxe Creative Room');
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(1);
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('filter-period-week-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-kpi-skeleton')).toBeInTheDocument();
    });
    // Schedule grid remains visible and schedule API is NOT re-called
    expect(screen.queryByTestId('dashboard-schedule-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('Deluxe Creative Room')).toBeInTheDocument();
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(1);
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(2);

    weekDeferred.resolve({ success: true, message: 'OK', data: mockKpiWeekData });

    await waitFor(() => {
      expect(screen.getByTestId('kpi-actual-revenue')).toHaveTextContent('6.500.000');
    });
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(1);
  });

  it('renders a skeleton in room KPI card #4 instead of 0 rooms when KPI resolves before initial schedule', async () => {
    const scheduleDeferred = createDeferred<{
      success: boolean;
      message: string;
      data: typeof mockScheduleData;
    }>();

    vi.mocked(adminDashboardApi.getDashboardSchedule).mockReturnValueOnce(scheduleDeferred.promise);

    renderWithContext();

    await screen.findByTestId('kpi-today-bookings');
    expect(screen.queryByTestId('kpi-total-rooms')).not.toBeInTheDocument();
    expect(screen.queryByText('0 phòng')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-skeleton-card')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-schedule-skeleton')).toBeInTheDocument();

    scheduleDeferred.resolve({ success: true, message: 'OK', data: mockScheduleData });

    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-rooms')).toHaveTextContent('2 phòng');
    });
    expect(screen.getByText('Deluxe Creative Room')).toBeInTheDocument();
  });

  it('batches selectedDate change and schedulePage reset into a single schedule request on page 1', async () => {
    const pagedData = {
      ...mockScheduleData,
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
    };
    vi.mocked(adminDashboardApi.getDashboardSchedule).mockResolvedValue({
      success: true,
      message: 'OK',
      data: pagedData,
    });

    renderWithContext();
    await screen.findByTestId('schedule-pagination');

    fireEvent.click(
      within(screen.getByTestId('schedule-pagination')).getByRole('button', { name: /Trang sau/i }),
    );
    await waitFor(() => {
      expect(adminDashboardApi.getDashboardSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything(),
      );
    });

    vi.mocked(adminDashboardApi.getDashboardKpi).mockClear();
    vi.mocked(adminDashboardApi.getDashboardSchedule).mockClear();

    fireEvent.change(screen.getByTestId('dashboard-date-picker'), {
      target: { value: '2026-10-20' },
    });

    await waitFor(() => {
      expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(1);
      expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(1);
    });
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledWith(
      { date: '2026-10-20', period: 'day' },
      expect.anything(),
    );
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledWith(
      { date: '2026-10-20', page: 1, limit: 20 },
      expect.anything(),
    );
  });

  it('isolates KPI failure from schedule and retries only KPI', async () => {
    vi.mocked(adminDashboardApi.getDashboardKpi)
      .mockRejectedValueOnce(new Error('Lỗi tải KPI'))
      .mockResolvedValueOnce({ success: true, message: 'OK', data: mockKpiDayData });

    renderWithContext();

    await screen.findByTestId('dashboard-error-banner');
    expect(screen.getByText(/Lỗi tải KPI/i)).toBeInTheDocument();
    // Schedule remains visible despite KPI failure
    expect(screen.getByText('Deluxe Creative Room')).toBeInTheDocument();
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('dashboard-retry-btn'));

    await screen.findByTestId('kpi-today-bookings');
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(2);
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(1);
  });

  it('isolates initial schedule failure from KPI, shows em-dash on card #4, and retries only schedule', async () => {
    vi.mocked(adminDashboardApi.getDashboardSchedule)
      .mockRejectedValueOnce(new Error('Lỗi tải lịch phòng'))
      .mockResolvedValueOnce({ success: true, message: 'OK', data: mockScheduleData });

    renderWithContext();

    await screen.findByTestId('dashboard-schedule-error-banner');
    expect(screen.getByText(/Lỗi tải lịch phòng/i)).toBeInTheDocument();
    // KPI cards still render; card #4 displays em-dash instead of misleading 0 rooms
    expect(screen.getByTestId('kpi-today-bookings')).toHaveTextContent('8');
    expect(screen.getByTestId('kpi-total-rooms')).toHaveTextContent('—');
    expect(screen.queryByText('0 phòng')).not.toBeInTheDocument();
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('dashboard-schedule-retry-btn'));

    await screen.findByText('Deluxe Creative Room');
    expect(screen.getByTestId('kpi-total-rooms')).toHaveTextContent('2 phòng');
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(2);
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(1);
  });

  it('deduplicates simultaneous KPI and schedule failures into one ErrorState and reloads both on retry/refresh', async () => {
    vi.mocked(adminDashboardApi.getDashboardKpi)
      .mockRejectedValueOnce(new Error('Mất kết nối máy chủ'))
      .mockResolvedValue({ success: true, message: 'OK', data: mockKpiDayData });
    vi.mocked(adminDashboardApi.getDashboardSchedule)
      .mockRejectedValueOnce(new Error('Mất kết nối máy chủ'))
      .mockResolvedValue({ success: true, message: 'OK', data: mockScheduleData });

    renderWithContext();

    await screen.findByTestId('dashboard-error-banner');
    expect(screen.queryByTestId('dashboard-schedule-error-banner')).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByText('Mất kết nối máy chủ')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('dashboard-retry-btn'));

    await screen.findByTestId('kpi-today-bookings');
    await screen.findByText('Deluxe Creative Room');
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(2);
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(2);

    // Top Refresh button reloads both endpoints in parallel
    fireEvent.click(screen.getByTestId('dashboard-refresh-btn'));

    await waitFor(() => {
      expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(3);
      expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(3);
    });
  });

  it('shows distinct scheduleError in combined ErrorState description when both endpoints fail with different messages', async () => {
    vi.mocked(adminDashboardApi.getDashboardKpi).mockRejectedValueOnce(new Error('Lỗi tải KPI'));
    vi.mocked(adminDashboardApi.getDashboardSchedule).mockRejectedValueOnce(
      new Error('Lỗi tải lịch phòng'),
    );

    renderWithContext();

    const banner = await screen.findByTestId('dashboard-error-banner');
    expect(screen.queryByTestId('dashboard-schedule-error-banner')).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(within(banner).getByText('Lỗi tải KPI')).toBeInTheDocument();
    expect(within(banner).getByText('Lỗi tải lịch phòng')).toBeInTheDocument();
  });

  it('aborts stale KPI request without aborting in-flight schedule and ignores out-of-order responses', async () => {
    const dayDeferred = createDeferred<{
      success: boolean;
      message: string;
      data: typeof mockKpiDayData;
    }>();
    const weekDeferred = createDeferred<{
      success: boolean;
      message: string;
      data: typeof mockKpiWeekData;
    }>();
    const day2Deferred = createDeferred<{
      success: boolean;
      message: string;
      data: typeof mockKpiDayData;
    }>();
    const week2Deferred = createDeferred<{
      success: boolean;
      message: string;
      data: typeof mockKpiWeekData;
    }>();
    const scheduleDeferred = createDeferred<{
      success: boolean;
      message: string;
      data: typeof mockScheduleData;
    }>();

    let daySignal: AbortSignal | undefined;
    let scheduleSignal: AbortSignal | undefined;

    vi.mocked(adminDashboardApi.getDashboardKpi)
      .mockImplementationOnce((_params, signal) => {
        daySignal = signal;
        return dayDeferred.promise;
      })
      .mockReturnValueOnce(weekDeferred.promise)
      .mockReturnValueOnce(day2Deferred.promise)
      .mockReturnValueOnce(week2Deferred.promise);

    vi.mocked(adminDashboardApi.getDashboardSchedule).mockImplementationOnce((_params, signal) => {
      scheduleSignal = signal;
      return scheduleDeferred.promise;
    });

    renderWithContext();

    await waitFor(() => {
      expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(1);
      expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(1);
    });

    // Switching period aborts only the stale KPI call and keeps the in-flight schedule call intact
    fireEvent.click(screen.getByTestId('filter-period-week-btn'));

    await waitFor(() => {
      expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(2);
    });
    expect(daySignal?.aborted).toBe(true);
    expect(scheduleSignal?.aborted).toBe(false);
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(1);

    // Newer week KPI settles first, then stale day KPI settles later and must be ignored
    weekDeferred.resolve({ success: true, message: 'OK', data: mockKpiWeekData });
    await waitFor(() => {
      expect(screen.getByTestId('kpi-actual-revenue')).toHaveTextContent('6.500.000');
    });

    dayDeferred.resolve({ success: true, message: 'OK', data: mockKpiDayData });
    scheduleDeferred.resolve({ success: true, message: 'OK', data: mockScheduleData });

    await screen.findByText('Deluxe Creative Room');
    expect(screen.getByTestId('kpi-actual-revenue')).toHaveTextContent('6.500.000');
    expect(screen.getByTestId('kpi-total-rooms')).toHaveTextContent('2 phòng');
    expect(screen.queryByTestId('dashboard-error-banner')).not.toBeInTheDocument();

    // Rapidly switching back and forth: rejecting an aborted request must not show an error or clear loading early
    fireEvent.click(screen.getByTestId('filter-period-day-btn'));
    fireEvent.click(screen.getByTestId('filter-period-week-btn'));
    day2Deferred.reject(new Error('canceled'));

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-kpi-skeleton')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('dashboard-error-banner')).not.toBeInTheDocument();

    week2Deferred.resolve({ success: true, message: 'OK', data: mockKpiWeekData });
    await waitFor(() => {
      expect(screen.getByTestId('kpi-actual-revenue')).toHaveTextContent('6.500.000');
    });
    expect(screen.queryByTestId('dashboard-error-banner')).not.toBeInTheDocument();
  });

  it('preserves roomSummary and retries the same page when a subsequent schedule page fails', async () => {
    const page1Data = {
      ...mockScheduleData,
      summary: { totalRooms: 45, availableRooms: 40, maintenanceRooms: 5 },
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
    };
    const page2Data = {
      ...page1Data,
      rooms: [
        {
          ...mockScheduleData.rooms[0],
          id: 'room-page-2',
          name: 'Executive Suite Page 2',
        },
      ],
      pagination: { page: 2, limit: 20, total: 45, totalPages: 3 },
    };

    vi.mocked(adminDashboardApi.getDashboardSchedule)
      .mockResolvedValueOnce({ success: true, message: 'OK', data: page1Data })
      .mockRejectedValueOnce(new Error('Lỗi tải trang 2'))
      .mockResolvedValueOnce({ success: true, message: 'OK', data: page2Data });

    renderWithContext();

    await screen.findByText('45 phòng');
    fireEvent.click(
      within(screen.getByTestId('schedule-pagination')).getByRole('button', { name: /Trang sau/i }),
    );

    await screen.findByTestId('dashboard-schedule-error-banner');
    expect(screen.getByText('Lỗi tải trang 2')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-total-rooms')).toHaveTextContent('45 phòng');
    expect(screen.queryByTestId('schedule-pagination')).not.toBeInTheDocument();
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('dashboard-schedule-retry-btn'));

    await screen.findByText('Executive Suite Page 2');
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, limit: 20 }),
      expect.anything(),
    );
    expect(adminDashboardApi.getDashboardKpi).toHaveBeenCalledTimes(1);
  });

  it('hides stale KPI cards and keeps RoomOverviewGrid visible when switching KPI period fails', async () => {
    vi.mocked(adminDashboardApi.getDashboardKpi)
      .mockResolvedValueOnce({ success: true, message: 'OK', data: mockKpiDayData })
      .mockRejectedValueOnce(new Error('Lỗi tải KPI tuần'));

    renderWithContext();

    await screen.findByTestId('kpi-today-bookings');
    await screen.findByText('Deluxe Creative Room');

    fireEvent.click(screen.getByTestId('filter-period-week-btn'));

    await screen.findByTestId('dashboard-error-banner');
    expect(screen.getByText('Lỗi tải KPI tuần')).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-today-bookings')).not.toBeInTheDocument();
    expect(screen.getByText('Deluxe Creative Room')).toBeInTheDocument();
    expect(adminDashboardApi.getDashboardSchedule).toHaveBeenCalledTimes(1);
  });
});
