import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminDashboardService } from '../services/admin-dashboard.service.js';

describe('AdminDashboardService (Business Logic & Calculations)', () => {
  let mockRepo: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRepo = {
      evaluateNoShowBookings: vi.fn().mockResolvedValue(0),
      getKpiData: vi.fn(),
      getScheduleData: vi.fn(),
    };
  });

  describe('KPI Calculations', () => {
    it('calculates occupancy rate correctly and counts actual revenue only from PAID bookings', async () => {
      // 2 available rooms, period: 1 day (1440 minutes per room = 2880 available room-minutes)
      // 1 booking: 2 hours (120 minutes) PAID, 300,000 VND
      // 1 booking: 4 hours (240 minutes) UNPAID, 600,000 VND
      // 1 booking: CANCELLED, 200,000 VND
      // Total booked minutes = 360 min. Occupancy rate = 360 / 2880 * 100 = 12.5%
      // Actual revenue = 300,000. Potential revenue = 900,000. Unpaid revenue = 600,000.
      mockRepo.getKpiData.mockResolvedValue({
        totalAvailableRooms: 2,
        todayBookingsCount: 3,
        periodBookingsCount: 3,
        bookedMinutes: 360,
        totalPeriodRoomMinutes: 2880,
        actualRevenue: '300000.00',
        potentialRevenue: '900000.00',
        unpaidRevenue: '600000.00',
        statusBreakdown: {
          confirmed: 1,
          completed: 1,
          cancelled: 1,
          noShow: 0,
        },
        paidBookingsCount: 1,
        unpaidBookingsCount: 1,
      });

      const service = new AdminDashboardService(mockRepo);
      const result = await service.getDashboardKpi(
        { date: '2026-10-14', period: 'day' },
        new Date('2026-10-14T08:00:00Z'),
      );

      expect(result.actualRevenue).toBe('300000.00');
      expect(result.potentialRevenue).toBe('900000.00');
      expect(result.unpaidRevenue).toBe('600000.00');
      expect(result.occupancyRate).toBe(12.5);
      expect(result.bookedMinutes).toBe(360);
      expect(result.todayBookingsCount).toBe(3);
      expect(result.paidBookingsCount).toBe(1);
    });

    it('handles zero available rooms gracefully without division by zero', async () => {
      mockRepo.getKpiData.mockResolvedValue({
        totalAvailableRooms: 0,
        todayBookingsCount: 0,
        periodBookingsCount: 0,
        bookedMinutes: 0,
        totalPeriodRoomMinutes: 0,
        actualRevenue: '0.00',
        potentialRevenue: '0.00',
        unpaidRevenue: '0.00',
        statusBreakdown: {
          confirmed: 0,
          completed: 0,
          cancelled: 0,
          noShow: 0,
        },
        paidBookingsCount: 0,
        unpaidBookingsCount: 0,
      });

      const service = new AdminDashboardService(mockRepo);
      const result = await service.getDashboardKpi(
        { date: '2026-10-14', period: 'day' },
        new Date('2026-10-14T08:00:00Z'),
      );

      expect(result.occupancyRate).toBe(0);
      expect(result.actualRevenue).toBe('0.00');
    });
  });
});
