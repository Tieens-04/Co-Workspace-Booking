import {
  AdminDashboardRepositoryContract,
  adminDashboardRepository as defaultRepo,
} from '../repositories/admin-dashboard.repository.js';
import {
  DashboardKpiFilter,
  DashboardKpiResponseDto,
  DashboardScheduleFilter,
  DashboardScheduleResponseDto,
} from '../types/admin-dashboard.type.js';
import { getDayBounds } from '../utils/room-availability.util.js';
import { getVietnamTodayString, getWeekBounds } from '../utils/dashboard-date.util.js';

export class AdminDashboardService {
  constructor(
    private readonly repo: AdminDashboardRepositoryContract = defaultRepo,
  ) {}

  async getDashboardKpi(
    filter: DashboardKpiFilter,
    now: Date = new Date(),
  ): Promise<DashboardKpiResponseDto> {
    await this.repo.evaluateNoShowBookings(now);

    const todayStr = getVietnamTodayString(now);
    const dateStr = filter.date || todayStr;
    const periodType = filter.period || 'day';

    const { dayStart: todayStart, dayEnd: todayEnd } = getDayBounds(todayStr);

    let startDate: Date;
    let endDate: Date;

    if (periodType === 'week') {
      const { weekStart, weekEnd } = getWeekBounds(dateStr);
      startDate = weekStart;
      endDate = weekEnd;
    } else {
      const { dayStart, dayEnd } = getDayBounds(dateStr);
      startDate = dayStart;
      endDate = dayEnd;
    }

    const raw = await this.repo.getKpiData({
      startDate,
      endDate,
      todayStart,
      todayEnd,
    });

    const occupancyRate =
      raw.totalPeriodRoomMinutes > 0
        ? Number(((raw.bookedMinutes / raw.totalPeriodRoomMinutes) * 100).toFixed(1))
        : 0;

    return {
      period: {
        type: periodType,
        date: dateStr,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      todayBookingsCount: raw.todayBookingsCount,
      periodBookingsCount: raw.periodBookingsCount,
      occupancyRate,
      totalRoomMinutes: raw.totalPeriodRoomMinutes,
      bookedMinutes: raw.bookedMinutes,
      actualRevenue: raw.actualRevenue,
      potentialRevenue: raw.potentialRevenue,
      unpaidRevenue: raw.unpaidRevenue,
      statusBreakdown: raw.statusBreakdown,
      paidBookingsCount: raw.paidBookingsCount,
      unpaidBookingsCount: raw.unpaidBookingsCount,
    };
  }

  async getDashboardSchedule(
    filter: DashboardScheduleFilter,
    now: Date = new Date(),
  ): Promise<DashboardScheduleResponseDto> {
    await this.repo.evaluateNoShowBookings(now);
    const todayStr = getVietnamTodayString(now);
    const dateStr = filter.date || todayStr;

    return this.repo.getScheduleData(dateStr);
  }
}

export const adminDashboardService = new AdminDashboardService();
