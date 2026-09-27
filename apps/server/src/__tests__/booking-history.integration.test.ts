import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role, RoomStatus, BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';

describe('Booking History & Detail Integration Tests (Real MySQL Database)', () => {
  const testPrefix = `test_history_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  let customer1Id: string;
  let customer1Token: string;
  let customer2Id: string;
  let customer2Token: string;

  let roomId: string;
  let maintenanceRoomId: string;

  let c1UpcomingBookingId: string;
  let c1PastCompletedBookingId: string;
  let c1PastConfirmedBookingId: string;
  let c1FutureCancelledBookingId: string;
  let c2BookingId: string;

  beforeAll(async () => {
    // 1. Create Customer 1
    const user1 = await prisma.user.create({
      data: {
        email: `${testPrefix}_c1@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Customer One',
        role: Role.CUSTOMER,
      },
    });
    customer1Id = user1.id;
    customer1Token = generateToken({ sub: customer1Id, role: Role.CUSTOMER });

    // 2. Create Customer 2
    const user2 = await prisma.user.create({
      data: {
        email: `${testPrefix}_c2@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Customer Two',
        role: Role.CUSTOMER,
      },
    });
    customer2Id = user2.id;
    customer2Token = generateToken({ sub: customer2Id, role: Role.CUSTOMER });

    // 3. Create rooms
    const room = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room`,
        capacity: 8,
        pricePerHour: new Prisma.Decimal('200.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    roomId = room.id;

    const mRoom = await prisma.room.create({
      data: {
        name: `${testPrefix}_Maint_Room`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('150.00'),
        status: RoomStatus.MAINTENANCE,
      },
    });
    maintenanceRoomId = mRoom.id;

    // 4. Create fixtures for Customer 1
    // A. Upcoming CONFIRMED booking (3 days from now)
    const now = Date.now();
    const upStart = new Date(now + 3 * 24 * 60 * 60 * 1000);
    const upEnd = new Date(upStart.getTime() + 2 * 60 * 60 * 1000);
    const bUpcoming = await prisma.booking.create({
      data: {
        bookingCode: `CS-20261001-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: customer1Id,
        roomId,
        startTime: upStart,
        endTime: upEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: 'Upcoming confirmed booking',
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c1UpcomingBookingId = bUpcoming.id;

    // B. Past COMPLETED booking (5 days ago)
    const pastStart = new Date(now - 5 * 24 * 60 * 60 * 1000);
    const pastEnd = new Date(pastStart.getTime() + 2 * 60 * 60 * 1000);
    const bCompleted = await prisma.booking.create({
      data: {
        bookingCode: `CS-20260920-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: customer1Id,
        roomId,
        startTime: pastStart,
        endTime: pastEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: 'Past completed booking',
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: 'CASH',
      },
    });
    c1PastCompletedBookingId = bCompleted.id;

    // C. Past CONFIRMED booking (2 days ago, ended, not yet marked completed/no-show)
    const pastConfStart = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const pastConfEnd = new Date(pastConfStart.getTime() + 2 * 60 * 60 * 1000);
    const bPastConf = await prisma.booking.create({
      data: {
        bookingCode: `CS-20260923-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: customer1Id,
        roomId,
        startTime: pastConfStart,
        endTime: pastConfEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: null,
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c1PastConfirmedBookingId = bPastConf.id;

    // D. Future CANCELLED booking (4 days from now)
    const cancStart = new Date(now + 4 * 24 * 60 * 60 * 1000);
    const cancEnd = new Date(cancStart.getTime() + 2 * 60 * 60 * 1000);
    const bCanc = await prisma.booking.create({
      data: {
        bookingCode: `CS-20261002-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: customer1Id,
        roomId,
        startTime: cancStart,
        endTime: cancEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: 'Customer self-cancelled',
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c1FutureCancelledBookingId = bCanc.id;

    // 5. Create fixture for Customer 2
    const c2Start = new Date(now + 1 * 24 * 60 * 60 * 1000);
    const c2End = new Date(c2Start.getTime() + 2 * 60 * 60 * 1000);
    const bC2 = await prisma.booking.create({
      data: {
        bookingCode: `CS-20260928-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: customer2Id,
        roomId: maintenanceRoomId,
        startTime: c2Start,
        endTime: c2End,
        totalAmount: new Prisma.Decimal('300.00'),
        note: null,
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c2BookingId = bC2.id;
  });

  afterAll(async () => {
    // Delete in FK order: bookings -> rooms -> users
    await prisma.booking.deleteMany({
      where: {
        id: {
          in: [
            c1UpcomingBookingId,
            c1PastCompletedBookingId,
            c1PastConfirmedBookingId,
            c1FutureCancelledBookingId,
            c2BookingId,
          ],
        },
      },
    });

    await prisma.room.deleteMany({
      where: { id: { in: [roomId, maintenanceRoomId] } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: [customer1Id, customer2Id] } },
    });

    await prisma.$disconnect();
  });

  describe('AC1: Customer isolation and ownership', () => {
    it('Customer 1 only sees their own bookings in list and pagination count', async () => {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pagination.total).toBe(4);
      expect(res.body.data.items).toHaveLength(4);

      const returnedIds = res.body.data.items.map((item: { id: string }) => item.id);
      expect(returnedIds).toContain(c1UpcomingBookingId);
      expect(returnedIds).toContain(c1PastCompletedBookingId);
      expect(returnedIds).toContain(c1PastConfirmedBookingId);
      expect(returnedIds).toContain(c1FutureCancelledBookingId);
      expect(returnedIds).not.toContain(c2BookingId);
    });

    it('Customer 2 only sees their single booking and total is 1', async () => {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${customer2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(1);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe(c2BookingId);
    });

    it('Customer 1 attempting to view Customer 2 booking detail returns 404 BOOKING_NOT_FOUND', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${c2BookingId}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
      expect(res.body.message).toBe('Không tìm thấy đặt phòng');
    });
  });

  describe('View Filters (ALL, UPCOMING, COMPLETED)', () => {
    it('view=UPCOMING returns only confirmed bookings starting >= now in ascending start time order', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?view=UPCOMING')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(1);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe(c1UpcomingBookingId);
      expect(res.body.data.items[0].status).toBe('CONFIRMED');
    });

    it('view=COMPLETED returns only completed bookings without inferring from time or payment', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?view=COMPLETED')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(1);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe(c1PastCompletedBookingId);
      expect(res.body.data.items[0].status).toBe('COMPLETED');
    });

    it('view=ALL returns all bookings ordered by startTime desc', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?view=ALL')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(4);
      const items = res.body.data.items;
      // Start times in desc order
      for (let i = 0; i < items.length - 1; i++) {
        const curr = new Date(items[i].startTime).getTime();
        const next = new Date(items[i + 1].startTime).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('AC2: Field details and preserved amounts', () => {
    it('returns booking detail with code, time, totalAmount as string, and status', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${c1UpcomingBookingId}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: c1UpcomingBookingId,
        totalAmount: '400.00',
        status: 'CONFIRMED',
        paymentStatus: 'UNPAID',
        paymentMethod: null,
        room: {
          id: roomId,
          name: `${testPrefix}_Room`,
        },
      });
      expect(res.body.data.bookingCode).toMatch(/^CS-\d{8}-[A-Z0-9]+$/);
    });

    it('preserves persisted totalAmount even when room price changes', async () => {
      // Temporarily change room price to 999.00
      await prisma.room.update({
        where: { id: roomId },
        data: { pricePerHour: new Prisma.Decimal('999.00') },
      });

      const res = await request(app)
        .get(`/api/v1/bookings/${c1UpcomingBookingId}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalAmount).toBe('400.00');

      // Restore room price
      await prisma.room.update({
        where: { id: roomId },
        data: { pricePerHour: new Prisma.Decimal('200.00') },
      });
    });

    it('GET operations do not modify booking status or timestamps', async () => {
      const before = await prisma.booking.findUnique({
        where: { id: c1PastConfirmedBookingId },
      });

      await request(app).get('/api/v1/bookings').set('Authorization', `Bearer ${customer1Token}`);

      await request(app)
        .get(`/api/v1/bookings/${c1PastConfirmedBookingId}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      const after = await prisma.booking.findUnique({
        where: { id: c1PastConfirmedBookingId },
      });

      expect(after?.status).toBe(before?.status);
      expect(after?.paymentStatus).toBe(before?.paymentStatus);
      expect(after?.updatedAt).toEqual(before?.updatedAt);
    });
  });
});
