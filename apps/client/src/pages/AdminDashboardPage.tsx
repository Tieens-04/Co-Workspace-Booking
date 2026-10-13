import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { adminDashboardApi } from '../services/admin-dashboard.api';
import {
  DashboardKpiData,
  DashboardScheduleData,
  DashboardPeriodType,
} from '../types/admin-dashboard';
import { RoomOverviewGrid } from '../components/RoomOverviewGrid';
import { formatCurrency } from '../utils/format';
import { getVietnamTodayString } from '../utils/bookingTime';

export const AdminDashboardPage: React.FC = () => {
  const { principal, logout } = useAuth();

  const [period, setPeriod] = useState<DashboardPeriodType>('day');
  const [selectedDate, setSelectedDate] = useState<string>(() => getVietnamTodayString());

  const [kpiData, setKpiData] = useState<DashboardKpiData | null>(null);
  const [scheduleData, setScheduleData] = useState<DashboardScheduleData | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchDashboardData = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const [kpiRes, scheduleRes] = await Promise.all([
        adminDashboardApi.getDashboardKpi({ date: selectedDate, period }, controller.signal),
        adminDashboardApi.getDashboardSchedule({ date: selectedDate }, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      if (kpiRes.success && scheduleRes.success) {
        setKpiData(kpiRes.data);
        setScheduleData(scheduleRes.data);
      } else {
        setError(kpiRes.message || scheduleRes.message || 'Không thể tải dữ liệu dashboard.');
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setError(
        err.response?.data?.message || err.message || 'Không thể tải dữ liệu dashboard. Vui lòng thử lại.',
      );
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, [selectedDate, period]);

  useEffect(() => {
    fetchDashboardData();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchDashboardData]);

  const handlePeriodChange = (newPeriod: DashboardPeriodType) => {
    if (newPeriod === period) return;
    setPeriod(newPeriod);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      setSelectedDate(val);
    }
  };

  const totalRoomsCount = scheduleData?.rooms.length || 0;
  const availableRoomsCount =
    scheduleData?.rooms.filter((r) => r.status === 'AVAILABLE').length || 0;
  const maintenanceRoomsCount =
    scheduleData?.rooms.filter((r) => r.status === 'MAINTENANCE').length || 0;

  return (
    <main className="page-container admin-dashboard-container">
      {/* App Header */}
      <header className="app-header">
        <div className="brand-section">
          <h1>📊 Co-Space Working — Bảng Điều Khiển (Dashboard)</h1>
          <p>Quản trị viên: {principal?.fullName || principal?.email}</p>
        </div>

        <nav className="nav-actions">
          <Link to="/admin" className="btn btn-outline" data-testid="nav-admin-rooms-link">
            Quản lý phòng
          </Link>
          <Link
            to="/admin/bookings"
            className="btn btn-outline"
            data-testid="nav-admin-bookings-link"
          >
            Quản lý đặt phòng
          </Link>
          <Link to="/" className="btn btn-outline">
            Về trang chủ
          </Link>
          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={() => logout('userAction')}
          >
            Đăng xuất
          </button>
        </nav>
      </header>

      {/* Filter and Period Selection Bar */}
      <section
        className="card"
        style={{
          marginBottom: '1.5rem',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: '#4a5568' }}>Bộ lọc thời gian:</span>
          <button
            type="button"
            className={`btn ${period === 'day' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.9rem' }}
            onClick={() => handlePeriodChange('day')}
            data-testid="filter-period-day-btn"
          >
            Hôm nay (Ngày)
          </button>
          <button
            type="button"
            className={`btn ${period === 'week' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.9rem' }}
            onClick={() => handlePeriodChange('week')}
            data-testid="filter-period-week-btn"
          >
            Tuần này (Tuần)
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label htmlFor="dashboardDate" style={{ fontWeight: 500, fontSize: '0.9rem' }}>
            Ngày xem:
          </label>
          <input
            id="dashboardDate"
            type="date"
            className="form-control"
            style={{ width: 'auto', padding: '0.35rem 0.65rem' }}
            value={selectedDate}
            onChange={handleDateChange}
            data-testid="dashboard-date-picker"
          />
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.9rem' }}
            onClick={() => fetchDashboardData()}
            data-testid="dashboard-refresh-btn"
          >
            🔄 Tải lại
          </button>
        </div>
      </section>

      {/* Loading state with Skeleton to prevent layout shift */}
      {isLoading && (
        <div
          data-testid="dashboard-kpi-skeleton"
          role="status"
          aria-busy="true"
          aria-live="polite"
          aria-label="Đang tải dữ liệu dashboard"
        >
          <p className="sr-only" data-testid="dashboard-loading-state">
            Đang tải dữ liệu dashboard...
          </p>
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={`kpi-skeleton-${index}`}
                className="card"
                style={{ padding: '1.25rem', minHeight: '140px' }}
                data-testid="kpi-skeleton-card"
              >
                <div className="skeleton skeleton-title" style={{ width: '60%', height: '14px' }} />
                <div
                  className="skeleton skeleton-text"
                  style={{ width: '40%', height: '32px', margin: '0.75rem 0' }}
                />
                <div className="skeleton skeleton-text" style={{ width: '80%', height: '12px' }} />
              </div>
            ))}
          </section>
          <div className="card" style={{ padding: '2rem', minHeight: '260px' }}>
            <div
              className="skeleton skeleton-title"
              style={{ width: '30%', height: '20px', marginBottom: '1rem' }}
            />
            <div className="skeleton skeleton-text" style={{ width: '100%', height: '180px' }} />
          </div>
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div
          className="alert alert-danger"
          role="alert"
          style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}
          data-testid="dashboard-error-banner"
        >
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>{error}</p>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => fetchDashboardData()}
            data-testid="dashboard-retry-btn"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Dashboard KPI Content */}
      {!isLoading && !error && kpiData && (
        <>
          {/* KPI Cards Grid */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* Card 1: Bookings */}
            <div
              className="card"
              style={{
                padding: '1.25rem',
                borderLeft: '4px solid #3182ce',
              }}
              data-testid="kpi-card-bookings"
            >
              <div style={{ color: '#718096', fontSize: '0.875rem', fontWeight: 500 }}>
                {period === 'day'
                  ? selectedDate === getVietnamTodayString()
                    ? 'ĐẶT PHÒNG HÔM NAY'
                    : 'ĐẶT PHÒNG TRONG NGÀY'
                  : 'ĐẶT PHÒNG TRONG TUẦN'}
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#2b6cb0',
                  margin: '0.4rem 0',
                }}
                data-testid="kpi-today-bookings"
              >
                {kpiData.periodBookingsCount}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#718096', lineHeight: 1.5 }}>
                <span>Đã xác nhận: {kpiData.statusBreakdown.confirmed}</span> •{' '}
                <span>Hoàn tất: {kpiData.statusBreakdown.completed}</span>
                <br />
                <span>Hủy: {kpiData.statusBreakdown.cancelled}</span> •{' '}
                <span>Không đến: {kpiData.statusBreakdown.noShow}</span>
              </div>
            </div>

            {/* Card 2: Occupancy Rate */}
            <div
              className="card"
              style={{
                padding: '1.25rem',
                borderLeft: '4px solid #38a169',
              }}
              data-testid="kpi-card-occupancy"
            >
              <div style={{ color: '#718096', fontSize: '0.875rem', fontWeight: 500 }}>
                TỶ LỆ LẤP ĐẦY PHÒNG
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#2f855a',
                  margin: '0.4rem 0',
                }}
                data-testid="kpi-occupancy-rate"
              >
                {kpiData.occupancyRate}%
              </div>
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: '#edf2f7',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  margin: '0.5rem 0',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, kpiData.occupancyRate))}%`,
                    height: '100%',
                    backgroundColor: '#38a169',
                    borderRadius: '3px',
                  }}
                />
              </div>
              <div style={{ fontSize: '0.8rem', color: '#718096' }}>
                Đã đặt: {kpiData.bookedMinutes} / {kpiData.totalRoomMinutes} phút
              </div>
            </div>

            {/* Card 3: Actual Revenue */}
            <div
              className="card"
              style={{
                padding: '1.25rem',
                borderLeft: '4px solid #d69e2e',
              }}
              data-testid="kpi-card-revenue"
            >
              <div style={{ color: '#718096', fontSize: '0.875rem', fontWeight: 500 }}>
                DOANH THU THỰC TẾ (PAID)
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#b7791f',
                  margin: '0.4rem 0',
                }}
                data-testid="kpi-actual-revenue"
              >
                {formatCurrency(kpiData.actualRevenue)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#718096', lineHeight: 1.5 }}>
                <span>Tạm tính: {formatCurrency(kpiData.potentialRevenue)}</span>
                <br />
                <span>Chưa thu: {formatCurrency(kpiData.unpaidRevenue)}</span>
              </div>
            </div>

            {/* Card 4: Room Status */}
            <div
              className="card"
              style={{
                padding: '1.25rem',
                borderLeft: '4px solid #805ad5',
              }}
              data-testid="kpi-card-rooms"
            >
              <div style={{ color: '#718096', fontSize: '0.875rem', fontWeight: 500 }}>
                TÌNH TRẠNG PHÒNG
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#6b46c1',
                  margin: '0.4rem 0',
                }}
                data-testid="kpi-total-rooms"
              >
                {totalRoomsCount} phòng
              </div>
              <div style={{ fontSize: '0.8rem', color: '#718096', lineHeight: 1.5 }}>
                <span>Khả dụng: {availableRoomsCount} phòng</span>
                <br />
                <span>Bảo trì: {maintenanceRoomsCount} phòng</span>
              </div>
            </div>
          </section>

          {/* Room Time-Grid Overview Section */}
          {scheduleData && (
            <RoomOverviewGrid rooms={scheduleData.rooms} date={scheduleData.date} />
          )}
        </>
      )}
    </main>
  );
};
