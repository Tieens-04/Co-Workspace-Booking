import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Calendar, DollarSign, Layers, Percent, RotateCw } from 'lucide-react';
import { m } from 'motion/react';
import { staggerChildren } from '@/lib/motion';
import { adminDashboardApi } from '../services/admin-dashboard.api';
import {
  DashboardKpiData,
  DashboardScheduleData,
  DashboardPeriodType,
} from '../types/admin-dashboard';
import { RoomOverviewGrid } from '../components/RoomOverviewGrid';
import { KpiCard, KpiCardSkeleton, KpiMeter } from '../components/admin/dashboard/KpiCard';
import { formatCurrency } from '../utils/format';
import { getVietnamTodayString } from '../utils/bookingTime';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/EmptyState';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

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
        err.response?.data?.message ||
          err.message ||
          'Không thể tải dữ liệu dashboard. Vui lòng thử lại.',
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:gap-8">
      <PageHeader
        eyebrow="Tổng quan"
        title="Bảng Điều Khiển Quản Trị"
        description="Theo dõi tình hình kinh doanh, doanh thu và tỷ lệ sử dụng phòng làm việc"
        className="gap-4 border-border pb-5"
      />

      {/* Filter and Period Selection Bar */}
      <section
        aria-label="Bộ lọc dashboard"
        className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between"
      >
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Khoảng thời gian:</span>
          <SegmentedControl<DashboardPeriodType>
            ariaLabel="Khoảng thời gian"
            value={period}
            onChange={handlePeriodChange}
            options={[
              { value: 'day', label: 'Hôm nay (Ngày)', testId: 'filter-period-day-btn' },
              { value: 'week', label: 'Tuần này (Tuần)', testId: 'filter-period-week-btn' },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="dashboardDate" className="text-sm font-medium">
              Ngày xem:
            </Label>
            <Input
              id="dashboardDate"
              type="date"
              className="w-auto tabular-nums"
              value={selectedDate}
              onChange={handleDateChange}
              data-testid="dashboard-date-picker"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => fetchDashboardData()}
            data-testid="dashboard-refresh-btn"
          >
            <RotateCw aria-hidden="true" />
            Tải lại
          </Button>
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
          className="grid gap-8"
        >
          <p className="sr-only" data-testid="dashboard-loading-state">
            Đang tải dữ liệu dashboard...
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <KpiCardSkeleton key={`kpi-skeleton-${index}`} />
            ))}
          </div>
          <div className="grid min-h-[260px] content-start gap-4 rounded-xl border bg-card p-6">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-[180px] w-full" />
          </div>
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <ErrorState
          data-testid="dashboard-error-banner"
          title={error}
          onRetry={() => fetchDashboardData()}
          retryTestId="dashboard-retry-btn"
        />
      )}

      {/* Dashboard KPI Content */}
      {!isLoading && !error && kpiData && (
        <>
          <m.section
            aria-label="Chỉ số tổng quan"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            variants={staggerChildren(0.05)}
            initial="hidden"
            animate="show"
          >
            <KpiCard
              testId="kpi-card-bookings"
              valueTestId="kpi-today-bookings"
              icon={Calendar}
              label={
                period === 'day'
                  ? selectedDate === getVietnamTodayString()
                    ? 'ĐẶT PHÒNG HÔM NAY'
                    : 'ĐẶT PHÒNG TRONG NGÀY'
                  : 'ĐẶT PHÒNG TRONG TUẦN'
              }
              value={kpiData.periodBookingsCount}
            >
              <p>
                Đã xác nhận:{' '}
                <strong className="font-semibold text-foreground">
                  {kpiData.statusBreakdown.confirmed}
                </strong>{' '}
                · Hoàn tất:{' '}
                <strong className="font-semibold text-foreground">
                  {kpiData.statusBreakdown.completed}
                </strong>
              </p>
              <p>
                Hủy: {kpiData.statusBreakdown.cancelled} · Không đến:{' '}
                {kpiData.statusBreakdown.noShow}
              </p>
            </KpiCard>

            <KpiCard
              testId="kpi-card-occupancy"
              valueTestId="kpi-occupancy-rate"
              icon={Percent}
              label="TỶ LỆ LẤP ĐẦY PHÒNG"
              value={`${kpiData.occupancyRate}%`}
              visual={<KpiMeter value={kpiData.occupancyRate} label="Tỷ lệ lấp đầy phòng" />}
            >
              <p>
                Đã đặt: {kpiData.bookedMinutes} / {kpiData.totalRoomMinutes} phút
              </p>
            </KpiCard>

            <KpiCard
              testId="kpi-card-revenue"
              valueTestId="kpi-actual-revenue"
              icon={DollarSign}
              label="DOANH THU THỰC TẾ (PAID)"
              value={formatCurrency(kpiData.actualRevenue)}
            >
              <p>Tạm tính: {formatCurrency(kpiData.potentialRevenue)}</p>
              <p>Chưa thu: {formatCurrency(kpiData.unpaidRevenue)}</p>
            </KpiCard>

            <KpiCard
              testId="kpi-card-rooms"
              valueTestId="kpi-total-rooms"
              icon={Layers}
              label="TÌNH TRẠNG PHÒNG"
              value={`${totalRoomsCount} phòng`}
            >
              <p>
                Khả dụng:{' '}
                <strong className="font-semibold text-foreground">{availableRoomsCount}</strong>{' '}
                phòng
              </p>
              <p>
                Bảo trì:{' '}
                <strong className="font-semibold text-foreground">{maintenanceRoomsCount}</strong>{' '}
                phòng
              </p>
            </KpiCard>
          </m.section>

          {/* Room Time-Grid Overview Section */}
          {scheduleData && <RoomOverviewGrid rooms={scheduleData.rooms} date={scheduleData.date} />}
        </>
      )}
    </div>
  );
};
