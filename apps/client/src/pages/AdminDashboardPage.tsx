import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { adminDashboardApi } from '../services/admin-dashboard.api';
import {
  DashboardKpiData,
  DashboardScheduleData,
  DashboardPeriodType,
} from '../types/admin-dashboard';
import { RoomOverviewGrid } from '../components/RoomOverviewGrid';
import { formatCurrency } from '../utils/format';
import { getVietnamTodayString } from '../utils/bookingTime';
import { AppHeader } from '../layouts/AppHeader';
import { AppFooter } from '../layouts/AppFooter';
import styles from './Admin.module.css';
import {
  LayoutDashboard,
  DoorOpen,
  BookOpen,
  RotateCw,
  Calendar,
  Percent,
  DollarSign,
  Layers,
  AlertTriangle,
} from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
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
    <div className={styles.pageWrapper}>
      <AppHeader />

      <main className={`page-container admin-dashboard-container ${styles.container}`}>
        {/* Header & Sub-navigation */}
        <div className={styles.headerSection}>
          <div className={styles.titleGroup}>
            <h1 className={styles.pageTitle}>
              <LayoutDashboard size={24} style={{ color: 'var(--color-primary)' }} />
              Bảng Điều Khiển Quản Trị
            </h1>
            <p className={styles.pageSubtitle}>
              Theo dõi tình hình kinh doanh, doanh thu và tỷ lệ sử dụng phòng làm việc
            </p>
          </div>

          <nav className={styles.subNav} aria-label="Điều hướng quản trị">
            <Link
              to="/admin/dashboard"
              className={`${styles.subNavLink} ${styles.subNavLinkActive}`}
            >
              <LayoutDashboard size={14} />
              <span>Tổng quan</span>
            </Link>
            <Link
              to="/admin"
              className={styles.subNavLink}
              data-testid="nav-admin-rooms-link"
            >
              <DoorOpen size={14} />
              <span>Quản lý phòng</span>
            </Link>
            <Link
              to="/admin/bookings"
              className={styles.subNavLink}
              data-testid="nav-admin-bookings-link"
            >
              <BookOpen size={14} />
              <span>Quản lý đặt phòng</span>
            </Link>
          </nav>
        </div>

        {/* Filter and Period Selection Bar */}
        <section className={`card ${styles.filterCard}`}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Khoảng thời gian:</span>
            <button
              type="button"
              className={`btn ${period === 'day' ? 'btn-primary' : 'btn-outline'} ${styles.filterBtn}`}
              onClick={() => handlePeriodChange('day')}
              data-testid="filter-period-day-btn"
            >
              Hôm nay (Ngày)
            </button>
            <button
              type="button"
              className={`btn ${period === 'week' ? 'btn-primary' : 'btn-outline'} ${styles.filterBtn}`}
              onClick={() => handlePeriodChange('week')}
              data-testid="filter-period-week-btn"
            >
              Tuần này (Tuần)
            </button>
          </div>

          <div className={styles.filterGroup}>
            <label htmlFor="dashboardDate" className={styles.filterLabel}>
              Ngày xem:
            </label>
            <input
              id="dashboardDate"
              type="date"
              className={`form-control ${styles.dateInput}`}
              value={selectedDate}
              onChange={handleDateChange}
              data-testid="dashboard-date-picker"
            />
            <button
              type="button"
              className={`btn btn-outline ${styles.filterBtn}`}
              onClick={() => fetchDashboardData()}
              data-testid="dashboard-refresh-btn"
            >
              <RotateCw size={14} /> Tải lại
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
            <section className={styles.kpiGrid}>
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
            style={{ marginBottom: '1.5rem', padding: '1.25rem' }}
            data-testid="dashboard-error-banner"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
              <AlertTriangle size={20} />
              <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>
            </div>
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
            <section className={`kpi-cards-grid ${styles.kpiGrid}`}>
              {/* Card 1: Bookings */}
              <div
                className={`card ${styles.kpiCard} ${styles.kpiCardBlue}`}
                data-testid="kpi-card-bookings"
              >
                <div className={styles.kpiTopRow}>
                  <span className={styles.kpiTitle}>
                    {period === 'day'
                      ? selectedDate === getVietnamTodayString()
                        ? 'ĐẶT PHÒNG HÔM NAY'
                        : 'ĐẶT PHÒNG TRONG NGÀY'
                      : 'ĐẶT PHÒNG TRONG TUẦN'}
                  </span>
                  <Calendar size={18} className={styles.kpiIcon} />
                </div>
                <div
                  className={`${styles.kpiValue} ${styles.kpiValueBlue}`}
                  data-testid="kpi-today-bookings"
                >
                  {kpiData.periodBookingsCount}
                </div>
                <div className={styles.kpiSub}>
                  <span>Đã xác nhận: <strong>{kpiData.statusBreakdown.confirmed}</strong></span> •{' '}
                  <span>Hoàn tất: <strong>{kpiData.statusBreakdown.completed}</strong></span>
                  <br />
                  <span>Hủy: {kpiData.statusBreakdown.cancelled}</span> •{' '}
                  <span>Không đến: {kpiData.statusBreakdown.noShow}</span>
                </div>
              </div>

              {/* Card 2: Occupancy Rate */}
              <div
                className={`card ${styles.kpiCard} ${styles.kpiCardGreen}`}
                data-testid="kpi-card-occupancy"
              >
                <div className={styles.kpiTopRow}>
                  <span className={styles.kpiTitle}>TỶ LỆ LẤP ĐẦY PHÒNG</span>
                  <Percent size={18} className={styles.kpiIcon} />
                </div>
                <div
                  className={`${styles.kpiValue} ${styles.kpiValueGreen}`}
                  data-testid="kpi-occupancy-rate"
                >
                  {kpiData.occupancyRate}%
                </div>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressBarFill}
                    style={{
                      width: `${Math.min(100, Math.max(0, kpiData.occupancyRate))}%`,
                    }}
                  />
                </div>
                <div className={styles.kpiSub}>
                  Đã đặt: {kpiData.bookedMinutes} / {kpiData.totalRoomMinutes} phút
                </div>
              </div>

              {/* Card 3: Actual Revenue */}
              <div
                className={`card ${styles.kpiCard} ${styles.kpiCardAmber}`}
                data-testid="kpi-card-revenue"
              >
                <div className={styles.kpiTopRow}>
                  <span className={styles.kpiTitle}>DOANH THU THỰC TẾ (PAID)</span>
                  <DollarSign size={18} className={styles.kpiIcon} />
                </div>
                <div
                  className={`${styles.kpiValue} ${styles.kpiValueAmber}`}
                  data-testid="kpi-actual-revenue"
                >
                  {formatCurrency(kpiData.actualRevenue)}
                </div>
                <div className={styles.kpiSub}>
                  <span>Tạm tính: {formatCurrency(kpiData.potentialRevenue)}</span>
                  <br />
                  <span>Chưa thu: {formatCurrency(kpiData.unpaidRevenue)}</span>
                </div>
              </div>

              {/* Card 4: Room Status */}
              <div
                className={`card ${styles.kpiCard} ${styles.kpiCardPurple}`}
                data-testid="kpi-card-rooms"
              >
                <div className={styles.kpiTopRow}>
                  <span className={styles.kpiTitle}>TÌNH TRẠNG PHÒNG</span>
                  <Layers size={18} className={styles.kpiIcon} />
                </div>
                <div
                  className={`${styles.kpiValue} ${styles.kpiValuePurple}`}
                  data-testid="kpi-total-rooms"
                >
                  {totalRoomsCount} phòng
                </div>
                <div className={styles.kpiSub}>
                  <span>Khả dụng: <strong>{availableRoomsCount}</strong> phòng</span>
                  <br />
                  <span>Bảo trì: <strong>{maintenanceRoomsCount}</strong> phòng</span>
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

      <AppFooter />
    </div>
  );
};
