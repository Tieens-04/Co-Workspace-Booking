import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, PaymentStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { getVietnamTodayString } from '../utils/dashboard-date.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';

/**
 * CWB-57: report GETs evaluate lazy no-shows only for the window they read, instead of the
 * whole bookings table. A booking outside that window keeps its stored status until a read
 * that covers it (or the unscoped admin list) evaluates it.
 */
describe('CWB-57 scoped lazy no-show evaluation (real MySQL)', () => {
  const prefix = `test_noshow_scope_${randomUUID().slice(0, 8)}`;
  const auth = {
    Authorization: `Bearer ${generateToken({ sub: randomUUID(), role: Role.ADMIN })}`,
  };
  let roomId: string;
  let otherRoomId: string;

  const missed = async (room: string, daysAgo: number) => {
    const start = new Date(Date.now() - daysAgo * 86_400_000);
    start.setUTCHours(2, 0, 0, 0); // 09:00 Vietnam
    return prisma.booking.create({
      data: {
        bookingCode: `CS-20261104-${randomUUID().slice(0, 4).toUpperCase()}`,
        roomId: room,
        guestName: 'Khách',
        guestPhone: '0900000000',
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        totalAmount: new Prisma.Decimal('100.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });
  };
  const statusOf = async (id: string) =>
    (await prisma.booking.findUniqueOrThrow({ where: { id } })).status;
  const vnDateOf = (date: Date) => getVietnamTodayString(date);

  beforeAll(async () => {
    const make = (name: string) =>
      prisma.room.create({
        data: {
          name: `${prefix}_${name}`,
          capacity: 4,
          pricePerHour: new Prisma.Decimal('100.00'),
          status: RoomStatus.AVAILABLE,
        },
      });
    roomId = (await make('A')).id;
    otherRoomId = (await make('B')).id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { roomId: { in: [roomId, otherRoomId] } } });
    await prisma.room.deleteMany({ where: { id: { in: [roomId, otherRoomId] } } });
    await prisma.$disconnect();
  });

  it('revenue evaluates only its period and room', async () => {
    const recent = await missed(roomId, 10);
    const old = await missed(roomId, 200);
    const otherRoom = await missed(otherRoomId, 10);

    const res = await request(app).get('/api/v1/admin/revenue').query({ roomId }).set(auth);
    expect(res.status).toBe(200);
    expect(await statusOf(recent.id)).toBe(BookingStatus.NO_SHOW);
    expect(await statusOf(old.id)).toBe(BookingStatus.CONFIRMED); // outside the 90-day default
    expect(await statusOf(otherRoom.id)).toBe(BookingStatus.CONFIRMED); // other room

    // A read that covers the old booking evaluates it.
    const day = vnDateOf(old.startTime);
    const covering = await request(app)
      .get('/api/v1/admin/revenue')
      .query({ roomId, startDate: day, endDate: day })
      .set(auth);
    expect(covering.status).toBe(200);
    expect(await statusOf(old.id)).toBe(BookingStatus.NO_SHOW);
  });

  it('schedule and KPI evaluate the selected day; CSV export its period', async () => {
    const scheduleDay = await missed(roomId, 30);
    const kpiDay = await missed(roomId, 40);
    const csvDay = await missed(roomId, 50);
    const untouched = await missed(roomId, 60);

    await request(app)
      .get('/api/v1/admin/dashboard/schedule')
      .query({ date: vnDateOf(scheduleDay.startTime) })
      .set(auth)
      .expect(200);
    await request(app)
      .get('/api/v1/admin/dashboard/kpi')
      .query({ date: vnDateOf(kpiDay.startTime), period: 'day' })
      .set(auth)
      .expect(200);
    const csv = vnDateOf(csvDay.startTime);
    await request(app)
      .get('/api/v1/admin/reports/bookings.csv')
      .query({ startDate: csv, endDate: csv, roomId })
      .set(auth)
      .expect(200);

    expect(await statusOf(scheduleDay.id)).toBe(BookingStatus.NO_SHOW);
    expect(await statusOf(kpiDay.id)).toBe(BookingStatus.NO_SHOW);
    expect(await statusOf(csvDay.id)).toBe(BookingStatus.NO_SHOW);
    expect(await statusOf(untouched.id)).toBe(BookingStatus.CONFIRMED);
  });

  it('includes a booking overlapping the window edge, skips checked-in ones', async () => {
    // Window = one Vietnam day, 70 days ago.
    const dayStr = vnDateOf(new Date(Date.now() - 70 * 86_400_000));
    const from = new Date(`${dayStr}T00:00:00+07:00`);
    const to = new Date(from.getTime() + 86_400_000);
    const create = (startTime: Date, hours: number, checkedInAt: Date | null = null) =>
      prisma.booking.create({
        data: {
          bookingCode: `CS-20261104-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId,
          guestName: 'Khách',
          guestPhone: '0900000000',
          startTime,
          endTime: new Date(startTime.getTime() + hours * 3_600_000),
          checkedInAt,
          totalAmount: new Prisma.Decimal('100.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });
    // Starts 21:30 the previous Vietnam day and ends 00:30 inside the window: overlaps it.
    const edge = await create(new Date(from.getTime() - 2.5 * 3_600_000), 3);
    const inside = new Date(from.getTime() + 10 * 3_600_000);
    const checkedIn = await create(inside, 1, inside);
    // Ends exactly at the window start: touching, not overlapping.
    const before = await create(new Date(from.getTime() - 3_600_000), 1);

    const count = await bookingRepository.evaluateNoShowBookings(new Date(), undefined, undefined, {
      from,
      to,
      roomId,
    });
    expect(count).toBe(1);
    expect(await statusOf(edge.id)).toBe(BookingStatus.NO_SHOW);
    expect(await statusOf(checkedIn.id)).toBe(BookingStatus.CONFIRMED);
    expect(await statusOf(before.id)).toBe(BookingStatus.CONFIRMED);
  });
});
