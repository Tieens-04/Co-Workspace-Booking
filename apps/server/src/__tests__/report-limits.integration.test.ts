import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  RoomStatus,
} from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { getVietnamTodayString } from '../utils/dashboard-date.util.js';

describe('CWB-57 bounded revenue period and paginated schedule (real MySQL)', () => {
  const prefix = `test_limits_${randomUUID().slice(0, 8)}`;
  const adminToken = generateToken({ sub: randomUUID(), role: Role.ADMIN });
  const roomIds: string[] = [];
  const auth = { Authorization: `Bearer ${adminToken}` };

  const paidBooking = (roomId: string, daysAgo: number, amount: string) => {
    const start = new Date(Date.now() - daysAgo * 86_400_000);
    start.setUTCHours(3, 0, 0, 0);
    return prisma.booking.create({
      data: {
        bookingCode: `CS-20261103-${randomUUID().slice(0, 4).toUpperCase()}`,
        roomId,
        guestName: 'Khách',
        guestPhone: '0900000000',
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        totalAmount: new Prisma.Decimal(amount),
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.CASH,
      },
    });
  };

  beforeAll(async () => {
    for (const name of ['A', 'B', 'C']) {
      const room = await prisma.room.create({
        data: {
          name: `${prefix}_${name}`,
          capacity: 4,
          pricePerHour: new Prisma.Decimal('100.00'),
          status: RoomStatus.AVAILABLE,
        },
      });
      roomIds.push(room.id);
    }
    await paidBooking(roomIds[0], 10, '100.00'); // inside the default 90-day window
    await paidBooking(roomIds[0], 200, '700.00'); // outside it
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.$disconnect();
  });

  it('aggregates only the last 90 days when no period is sent and reports that period', async () => {
    const res = await request(app)
      .get('/api/v1/admin/revenue')
      .query({ roomId: roomIds[0] })
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.actualRevenue).toBe('100.00');
    expect(res.body.data.period.endDate).toBe(getVietnamTodayString());
    expect(res.body.data.period.startDate).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));

    const wide = await request(app)
      .get('/api/v1/admin/revenue')
      .query({
        roomId: roomIds[0],
        startDate: getVietnamTodayString(new Date(Date.now() - 300 * 86_400_000)),
      })
      .set(auth);
    // An explicit start 300 days back fits within 366 days and includes the older booking.
    expect(wide.status).toBe(200);
    expect(wide.body.data.actualRevenue).toBe('800.00');
  });

  it('rejects a period longer than 366 days with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/v1/admin/revenue')
      .query({ startDate: '2025-01-01', endDate: '2026-01-02' })
      .set(auth);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('pages the schedule by room without overlaps or gaps', async () => {
    const first = await request(app)
      .get('/api/v1/admin/dashboard/schedule')
      .query({ limit: 2 })
      .set(auth);
    expect(first.status).toBe(200);
    const { total, totalPages, limit } = first.body.data.pagination;
    expect(limit).toBe(2);
    expect(first.body.data.rooms.length).toBeLessThanOrEqual(2);
    const { totalRooms, availableRooms, maintenanceRooms } = first.body.data.summary;
    expect(totalRooms).toBe(total);
    expect(availableRooms + maintenanceRooms).toBe(total);

    const seen: string[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/schedule')
        .query({ limit: 2, page })
        .set(auth);
      expect(res.body.data.pagination.page).toBe(page);
      seen.push(...res.body.data.rooms.map((room: { id: string }) => room.id));
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(total);
    expect(seen).toEqual(expect.arrayContaining(roomIds));
  });
});
