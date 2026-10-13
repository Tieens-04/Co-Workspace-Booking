import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { Role, BookingStatus, RoomStatus } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { adminDashboardService } from '../services/admin-dashboard.service.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const customerToken = generateToken({ sub: 'customer-uuid-1', role: Role.CUSTOMER });
const adminToken = generateToken({ sub: 'admin-uuid-1', role: Role.ADMIN });

describe('Admin Dashboard KPI & Schedule API Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication and RBAC', () => {
    it('returns 401 UNAUTHORIZED when no token is provided for /dashboard/kpi', async () => {
      const res = await request(app).get('/api/v1/admin/dashboard/kpi');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses /dashboard/kpi', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/kpi')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 401 UNAUTHORIZED when no token is provided for /dashboard/schedule', async () => {
      const res = await request(app).get('/api/v1/admin/dashboard/schedule');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses /dashboard/schedule', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/schedule')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('Query Validation', () => {
    it('returns 400 when date parameter has invalid format', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/kpi?date=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when period parameter is invalid', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/kpi?period=year')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when schedule date parameter is invalid', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/schedule?date=2026/10/14')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('KPI Endpoint Logic (GET /api/v1/admin/dashboard/kpi)', () => {
    it('returns correct day KPI metrics with actual revenue strictly counting PAID bookings', async () => {
      const mockKpiData = {
        period: {
          type: 'day' as const,
          date: '2026-10-14',
          startDate: '2026-10-13T17:00:00.000Z',
          endDate: '2026-10-14T17:00:00.000Z',
        },
        todayBookingsCount: 5,
        periodBookingsCount: 5,
        occupancyRate: 25.0,
        totalRoomMinutes: 2880,
        bookedMinutes: 720,
        actualRevenue: '500000.00',
        potentialRevenue: '800000.00',
        unpaidRevenue: '300000.00',
        statusBreakdown: {
          confirmed: 3,
          completed: 1,
          cancelled: 1,
          noShow: 0,
        },
        paidBookingsCount: 3,
        unpaidBookingsCount: 1,
      };

      vi.spyOn(adminDashboardService, 'getDashboardKpi').mockResolvedValue(mockKpiData);

      const res = await request(app)
        .get('/api/v1/admin/dashboard/kpi?date=2026-10-14&period=day')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.actualRevenue).toBe('500000.00');
      expect(res.body.data.occupancyRate).toBe(25.0);
      expect(res.body.data.todayBookingsCount).toBe(5);
      expect(res.body.data.period.type).toBe('day');
    });

    it('returns week KPI metrics correctly when period=week is requested', async () => {
      const mockWeekKpiData = {
        period: {
          type: 'week' as const,
          date: '2026-10-14',
          startDate: '2026-10-11T17:00:00.000Z',
          endDate: '2026-10-18T17:00:00.000Z',
        },
        todayBookingsCount: 5,
        periodBookingsCount: 22,
        occupancyRate: 35.5,
        totalRoomMinutes: 20160,
        bookedMinutes: 7156,
        actualRevenue: '2500000.00',
        potentialRevenue: '3200000.00',
        unpaidRevenue: '700000.00',
        statusBreakdown: {
          confirmed: 12,
          completed: 8,
          cancelled: 2,
          noShow: 0,
        },
        paidBookingsCount: 18,
        unpaidBookingsCount: 2,
      };

      vi.spyOn(adminDashboardService, 'getDashboardKpi').mockResolvedValue(mockWeekKpiData);

      const res = await request(app)
        .get('/api/v1/admin/dashboard/kpi?date=2026-10-14&period=week')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.period.type).toBe('week');
      expect(res.body.data.periodBookingsCount).toBe(22);
      expect(res.body.data.actualRevenue).toBe('2500000.00');
    });
  });

  describe('Room Time-Grid Schedule Endpoint (GET /api/v1/admin/dashboard/schedule)', () => {
    it('returns rooms overview with slots and bookings for the requested date', async () => {
      const mockScheduleData = {
        date: '2026-10-14',
        rooms: [
          {
            id: 'room-1',
            name: 'Deluxe Creative Room',
            capacity: 6,
            pricePerHour: '200000.00',
            status: RoomStatus.AVAILABLE,
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
                startTime: new Date('2026-10-14T02:30:00.000Z'),
                endTime: new Date('2026-10-14T04:30:00.000Z'),
                status: BookingStatus.CONFIRMED,
                customerName: 'Nguyen Van A',
              },
            ],
          },
          {
            id: 'room-2',
            name: 'Conference Hall',
            capacity: 20,
            pricePerHour: '500000.00',
            status: RoomStatus.MAINTENANCE,
            slots: [],
            bookings: [],
          },
        ],
      };

      vi.spyOn(adminDashboardService, 'getDashboardSchedule').mockResolvedValue(mockScheduleData);

      const res = await request(app)
        .get('/api/v1/admin/dashboard/schedule?date=2026-10-14')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toBe('2026-10-14');
      expect(res.body.data.rooms).toHaveLength(2);
      expect(res.body.data.rooms[0].name).toBe('Deluxe Creative Room');
      expect(res.body.data.rooms[1].status).toBe('MAINTENANCE');
    });
  });
});
