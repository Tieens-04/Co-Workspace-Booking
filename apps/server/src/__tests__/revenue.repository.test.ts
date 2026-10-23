import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus, PaymentStatus, Prisma, RoomStatus } from '@prisma/client';
import { BookingRepository } from '../repositories/booking.repository.js';
import { AdminDashboardRepository } from '../repositories/admin-dashboard.repository.js';

const database = vi.hoisted(() => ({
  booking: { findMany: vi.fn(), count: vi.fn() },
  room: { count: vi.fn(), findMany: vi.fn() },
}));
vi.mock('../utils/prisma.util.js', () => ({
  default: {
    ...database,
    $transaction: async (callback: (db: typeof database) => Promise<unknown>) => callback(database),
  },
}));

describe('Revenue repositories: cancelled payments', () => {
  beforeEach(() => vi.resetAllMocks());

  it('retains paid cancelled revenue in both reports without occupying the room', async () => {
    const records = [
      {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.PAID,
        totalAmount: new Prisma.Decimal('100.10'),
      },
      {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: new Prisma.Decimal('200.00'),
      },
      {
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: new Prisma.Decimal('0.20'),
      },
    ].map((record, index) => ({
      ...record,
      id: String(index),
      roomId: 'room-1',
      startTime: new Date('2030-01-01T01:00:00Z'),
      endTime: new Date('2030-01-01T02:00:00Z'),
    }));
    database.booking.findMany.mockResolvedValue(records);
    database.booking.count.mockResolvedValue(3);
    database.room.count.mockResolvedValue(1);
    database.room.findMany.mockResolvedValue([
      {
        id: 'room-1',
        createdAt: new Date('2029-01-01T00:00:00Z'),
        statusHistory: [
          { status: RoomStatus.AVAILABLE, effectiveAt: new Date('2029-01-01T00:00:00Z') },
        ],
      },
    ]);
    const repository = new BookingRepository();
    vi.spyOn(repository, 'evaluateNoShowBookings').mockResolvedValue(0);

    const revenue = await repository.calculateRevenue({});
    const kpi = await new AdminDashboardRepository().getKpiData({
      startDate: new Date('2030-01-01T00:00:00Z'),
      endDate: new Date('2030-01-02T00:00:00Z'),
      todayStart: new Date('2030-01-01T00:00:00Z'),
      todayEnd: new Date('2030-01-02T00:00:00Z'),
    });
    for (const result of [revenue, kpi]) {
      expect(result.actualRevenue).toBe('100.10');
      expect(result.unpaidRevenue).toBe('0.20');
      expect(result.potentialRevenue).toBe('100.30');
    }
    expect(revenue).toMatchObject({
      totalBookings: 3,
      paidBookings: 1,
      unpaidBookings: 1,
      cancelledBookings: 2,
    });
    expect(kpi).toMatchObject({
      paidBookingsCount: 1,
      unpaidBookingsCount: 1,
      bookedMinutes: 60,
      statusBreakdown: { cancelled: 2, confirmed: 1 },
    });
  });
});
