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
import { Pagination } from '@/components/common/Pagination';

const SCHEDULE_PAGE_SIZE = 20;

const getErrorMessage = (err: unknown, fallback: string): string => {
  const axiosMessage = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  if (axiosMessage) return axiosMessage;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};

export const AdminDashboardPage: React.FC = () => {
  const [period, setPeriod] = useState<DashboardPeriodType>('day');
  const [selectedDate, setSelectedDate] = useState<string>(() => getVietnamTodayString());
  // CWB-57: the room schedule is paginated server-side.
  const [schedulePage, setSchedulePage] = useState(1);

  const [kpiData, setKpiData] = useState<DashboardKpiData | null>(null);
  const [isKpiLoading, setIsKpiLoading] = useState<boolean>(true);
  const [kpiError, setKpiError] = useState<string | null>(null);

  const [scheduleData, setScheduleData] = useState<DashboardScheduleData | null>(null);
  const [roomSummary, setRoomSummary] = useState<DashboardScheduleData['summary'] | null>(null);
  const [isScheduleLoading, setIsScheduleLoading] = useState<boolean>(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const kpiAbortRef = useRef<AbortController | null>(null);
  const scheduleAbortRef = useRef<AbortController | null>(null);

  const fetchKpi = useCallback(async () => {
    kpiAbortRef.current?.abort();
    const controller = new AbortController();
    kpiAbortRef.current = controller;

    setIsKpiLoading(true);
    setKpiError(null);

    try {
      const kpiRes = await adminDashboardApi.getDashboardKpi(
        { date: selectedDate, period },
        controller.signal,
      );

      if (controller.signal.aborted || kpiAbortRef.current !== controller) return;

      if (kpiRes.success) {
        setKpiData(kpiRes.data);
      } else {
        setKpiError(kpiRes.message || 'Không thể tải dữ liệu dashboard.');
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || kpiAbortRef.current !== controller) return;
      setKpiError(getErrorMessage(err, 'Không thể tải dữ liệu dashboard. Vui lòng thử lại.'));
    } finally {
      if (kpiAbortRef.current === controller) {
        setIsKpiLoading(false);
      }
    }
  }, [selectedDate, period]);

  const fetchSchedule = useCallback(async () => {
    scheduleAbortRef.current?.abort();
    const controller = new AbortController();
    scheduleAbortRef.current = controller;

    setIsScheduleLoading(true);
    setScheduleError(null);

    try {
      const scheduleRes = await adminDashboardApi.getDashboardSchedule(
        { date: selectedDate, page: schedulePage, limit: SCHEDULE_PAGE_SIZE },
        controller.signal,
      );

      if (controller.signal.aborted || scheduleAbortRef.current !== controller) return;

      if (scheduleRes.success) {
        setScheduleData(scheduleRes.data);
        setRoomSummary(scheduleRes.data.summary);
      } else {
        setScheduleError(scheduleRes.message || 'Không thể tải lịch phòng.');
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || scheduleAbortRef.current !== controller) return;
      setScheduleError(getErrorMessage(err, 'Không thể tải lịch phòng. Vui lòng thử lại.'));
    } finally {
      if (scheduleAbortRef.current === controller) {
        setIsScheduleLoading(false);
      }
    }
  }, [selectedDate, schedulePage]);

  useEffect(() => {
    void fetchKpi();

    return () => {
      kpiAbortRef.current?.abort();
    };
  }, [fetchKpi]);

  useEffect(() => {
    void fetchSchedule();

    return () => {
      scheduleAbortRef.current?.abort();
    };
  }, [fetchSchedule]);

  const handleRefreshAll = () => {
    void fetchKpi();
    void fetchSchedule();
  };

  const handlePeriodChange = (newPeriod: DashboardPeriodType) => {
    if (newPeriod === period) return;
    setPeriod(newPeriod);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val && val !== selectedDate) {
      setSelectedDate(val);
      setSchedulePage(1);
    }
  };

  const isAnyLoading = isKpiLoading || isScheduleLoading;
  const hasCombinedError =
    !isKpiLoading && !isScheduleLoading && Boolean(kpiError && scheduleError);

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
            onClick={handleRefreshAll}
            data-testid="dashboard-refresh-btn"
          >
            <RotateCw
              aria-hidden="true"
              className={isAnyLoading ? 'motion-safe:animate-spin' : undefined}
            />
            Tải lại
          </Button>
        </div>
      </section>

      {/* Combined error banner when both endpoints fail simultaneously */}
      {hasCombinedError && kpiError && (
        <ErrorState
          data-testid="dashboard-error-banner"
          title={kpiError}
          description={scheduleError && scheduleError !== kpiError ? scheduleError : undefined}
          onRetry={handleRefreshAll}
          retryTestId="dashboard-retry-btn"
        />
      )}

      {!hasCombinedError && (
        <>
          {/* KPI Section */}
          {isKpiLoading && (
            <div
              data-testid="dashboard-kpi-skeleton"
              role="status"
              aria-busy="true"
              aria-live="polite"
              aria-label="Đang tải dữ liệu dashboard"
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            >
              <p className="sr-only" data-testid="dashboard-loading-state">
                Đang tải dữ liệu dashboard...
              </p>
              {Array.from({ length: 4 }, (_, index) => (
                <KpiCardSkeleton key={`kpi-skeleton-${index}`} />
              ))}
            </div>
          )}

          {!isKpiLoading && kpiError && (
            <ErrorState
              data-testid="dashboard-error-banner"
              title={kpiError}
              onRetry={() => void fetchKpi()}
              retryTestId="dashboard-retry-btn"
            />
          )}

          {!isKpiLoading && !kpiError && kpiData && (
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

              {!roomSummary && isScheduleLoading ? (
                <KpiCardSkeleton />
              ) : (
                <KpiCard
                  testId="kpi-card-rooms"
                  valueTestId="kpi-total-rooms"
                  icon={Layers}
                  label="TÌNH TRẠNG PHÒNG"
                  value={roomSummary ? `${roomSummary.totalRooms} phòng` : '—'}
                >
                  <p>
                    Khả dụng:{' '}
                    <strong className="font-semibold text-foreground">
                      {roomSummary ? roomSummary.availableRooms : '—'}
                    </strong>
                    {roomSummary ? ' phòng' : null}
                  </p>
                  <p>
                    Bảo trì:{' '}
                    <strong className="font-semibold text-foreground">
                      {roomSummary ? roomSummary.maintenanceRooms : '—'}
                    </strong>
                    {roomSummary ? ' phòng' : null}
                  </p>
                </KpiCard>
              )}
            </m.section>
          )}

          {/* Room Time-Grid Overview Section */}
          {isScheduleLoading && (
            <div
              data-testid="dashboard-schedule-skeleton"
              role="status"
              aria-busy="true"
              aria-live="polite"
              aria-label="Đang tải lịch phòng"
              className="grid min-h-[260px] content-start gap-4 rounded-xl border bg-card p-6"
            >
              <p className="sr-only" data-testid="dashboard-schedule-loading-state">
                Đang tải lịch phòng...
              </p>
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-[180px] w-full" />
            </div>
          )}

          {!isScheduleLoading && scheduleError && (
            <ErrorState
              data-testid="dashboard-schedule-error-banner"
              title={scheduleError}
              onRetry={() => void fetchSchedule()}
              retryTestId="dashboard-schedule-retry-btn"
            />
          )}

          {!isScheduleLoading && !scheduleError && scheduleData && (
            <RoomOverviewGrid rooms={scheduleData.rooms} date={scheduleData.date} />
          )}

          {!scheduleError && scheduleData && scheduleData.pagination.totalPages > 1 && (
            <Pagination
              page={schedulePage}
              totalPages={scheduleData.pagination.totalPages}
              onPageChange={setSchedulePage}
              disabled={isScheduleLoading}
              ariaLabel="Phân trang lịch phòng"
              testId="schedule-pagination"
            />
          )}
        </>
      )}
    </div>
  );
};
