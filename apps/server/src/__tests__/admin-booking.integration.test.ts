import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  Role,
  RoomStatus,
  BookingStatus,
  PaymentStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';

describe('Admin Booking Management & Guest Booking Integration Tests (Real MySQL & Transactions)', () => {
  const testPrefix = `test_admin_booking_${randomUUID().slice(0, 8)}`;

  let testUserId: string;
  let customerToken: string;
  let adminUserId: string;
  let adminToken: string;

  let availableRoomId: string;
  let maintenanceRoomId: string;

  beforeAll(async () => {
    // Create customer user
    const user = await prisma.user.create({
      data: {
        email: `${testPrefix}_customer@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Khách Hàng Thật',
        phoneNumber: '0901112222',
        role: Role.CUSTOMER,
      },
    });
    testUserId = user.id;
    customerToken = generateToken({ sub: testUserId, role: Role.CUSTOMER });

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email: `${testPrefix}_admin@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Admin Quản Trị',
        phoneNumber: '0909998888',
        role: Role.ADMIN,
      },
    });
    adminUserId = admin.id;
    adminToken = generateToken({ sub: adminUserId, role: Role.ADMIN });

    // Create rooms
    const room1 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Available_Room`,
        capacity: 10,
        pricePerHour: new Prisma.Decimal('200.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    availableRoomId = room1.id;

    const room2 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Maintenance_Room`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100.00'),
        status: RoomStatus.MAINTENANCE,
      },
    });
    maintenanceRoomId = room2.id;
  });

  afterAll(async () => {
    // Delete in FK order: bookings -> rooms -> users
    await prisma.booking.deleteMany({
      where: { roomId: { in: [availableRoomId, maintenanceRoomId] } },
    });

    await prisma.room.deleteMany({
      where: { id: { in: [availableRoomId, maintenanceRoomId] } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, adminUserId] } },
    });

    await prisma.$disconnect();
  });

  describe('AC2: Guest Booking Creation Flow', () => {
    it('creates guest booking without creating a User, persisting userId=null, guestName, guestPhone, and server pricing', async () => {
      // 2 hours duration, starting 3 days ahead at 09:00 UTC
      const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 120 * 60 * 1000); // 2h

      const uniqueGuestPhone = `098${Math.floor(1000000 + Math.random() * 9000000)}`;
      const uniqueGuestName = `Khách Vãng Lai ${testPrefix}`;

      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          guestName: uniqueGuestName,
          guestPhone: uniqueGuestPhone,
          note: 'Khách thanh toán sau',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.customer).toEqual({
        kind: 'GUEST',
        name: uniqueGuestName,
        phone: uniqueGuestPhone,
      });
      // 200.00 * 2 = 400.00
      expect(res.body.data.totalAmount).toBe('400.00');
      expect(res.body.data.status).toBe(BookingStatus.CONFIRMED);
      expect(res.body.data.paymentStatus).toBe(PaymentStatus.UNPAID);
      expect(res.body.data.paymentMethod).toBeNull();

      // Verify in DB directly
      const dbBooking = await prisma.booking.findUnique({
        where: { id: res.body.data.id },
      });
      expect(dbBooking).not.toBeNull();
      expect(dbBooking!.userId).toBeNull();
      expect(dbBooking!.guestName).toBe(uniqueGuestName);
      expect(dbBooking!.guestPhone).toBe(uniqueGuestPhone);
      expect(dbBooking!.totalAmount.toFixed(2)).toBe('400.00');

      // Verify that NO User was created with this phone number or name
      const ghostUser = await prisma.user.findFirst({
        where: { phoneNumber: uniqueGuestPhone },
      });
      expect(ghostUser).toBeNull();
    });

    it('allows guest booking using the same phone number as an existing User without linking ownership', async () => {
      // testUserId has phoneNumber '0901112222'
      const start = new Date(Date.now() + 60 * 60 * 60 * 1000);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          guestName: 'Khách Trùng SĐT',
          guestPhone: '0901112222', // Same as testUserId
        });

      expect(res.status).toBe(201);
      expect(res.body.data.customer).toEqual({
        kind: 'GUEST',
        name: 'Khách Trùng SĐT',
        phone: '0901112222',
      });

      const dbBooking = await prisma.booking.findUnique({
        where: { id: res.body.data.id },
      });
      expect(dbBooking).not.toBeNull();
      expect(dbBooking!.userId).toBeNull(); // Still null, not linked to testUserId!
      expect(dbBooking!.guestPhone).toBe('0901112222');

      // Customer with phoneNumber '0901112222' cannot see or access this guest booking
      const custDetailRes = await request(app)
        .get(`/api/v1/bookings/${res.body.data.id}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(custDetailRes.status).toBe(404);

      const custCancelRes = await request(app)
        .patch(`/api/v1/bookings/${res.body.data.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(custCancelRes.status).toBe(404);
    });

    it('rejects guest booking when room is in MAINTENANCE with 409 ROOM_NOT_AVAILABLE', async () => {
      const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: maintenanceRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          guestName: 'Khách Thử',
          guestPhone: '0988776655',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
    });
  });

  describe('Customer Ownership & Isolation', () => {
    it('ensures customer cannot see, view, or cancel guest bookings', async () => {
      // Create a guest booking
      const start = new Date(Date.now() + 80 * 60 * 60 * 1000);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const guestRes = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          guestName: 'Khách Độc Lập',
          guestPhone: '0933333333',
        });
      expect(guestRes.status).toBe(201);
      const guestBookingId = guestRes.body.data.id;

      // 1. Customer GET /api/v1/bookings must NOT include this guest booking
      const listRes = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(listRes.status).toBe(200);
      const foundInList = listRes.body.data.items.some(
        (b: { id: string }) => b.id === guestBookingId,
      );
      expect(foundInList).toBe(false);

      // 2. Customer GET /api/v1/bookings/:id must return 404
      const detailRes = await request(app)
        .get(`/api/v1/bookings/${guestBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(detailRes.status).toBe(404);
      expect(detailRes.body.code).toBe('BOOKING_NOT_FOUND');

      // 3. Customer PATCH /api/v1/bookings/:id/cancel must return 404
      const cancelRes = await request(app)
        .patch(`/api/v1/bookings/${guestBookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(cancelRes.status).toBe(404);
      expect(cancelRes.body.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('AC1: Admin Booking Search and Filter', () => {
    let userBookingCode: string;
    let guestBookingCode: string;
    let cancelledMidnightCode: string;
    let noShowNextDayCode: string;
    let overnightPrevDayCode: string;
    let targetDateStr: string;

    beforeAll(async () => {
      // Create user booking on 2026-11-15T09:00:00+07:00
      // 09:00 VN (+07:00) is 02:00 UTC
      targetDateStr = '2026-11-15';
      const userStart = new Date('2026-11-15T02:00:00.000Z');
      const userEnd = new Date('2026-11-15T04:00:00.000Z');

      const userBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261115-${randomUUID().slice(0, 4).toUpperCase()}`,
          userId: testUserId,
          roomId: availableRoomId,
          startTime: userStart,
          endTime: userEnd,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: null,
        },
      });
      userBookingCode = userBooking.bookingCode;

      // Create guest booking on the same VN day at 14:00 VN (+07:00) -> 07:00 UTC
      const guestStart = new Date('2026-11-15T07:00:00.000Z');
      const guestEnd = new Date('2026-11-15T09:00:00.000Z');

      const guestBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261115-${randomUUID().slice(0, 4).toUpperCase()}`,
          userId: null,
          guestName: 'Phạm Thị Khách',
          guestPhone: '0977889900',
          roomId: availableRoomId,
          startTime: guestStart,
          endTime: guestEnd,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.COMPLETED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: null,
        },
      });
      guestBookingCode = guestBooking.bookingCode;

      // Midnight start booking at exactly 00:00 VN on 2026-11-15 (17:00 UTC on 2026-11-14)
      const midnightBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261115-${randomUUID().slice(0, 4).toUpperCase()}`,
          userId: testUserId,
          roomId: availableRoomId,
          startTime: new Date('2026-11-14T17:00:00.000Z'),
          endTime: new Date('2026-11-14T19:00:00.000Z'),
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CANCELLED,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: null,
        },
      });
      cancelledMidnightCode = midnightBooking.bookingCode;

      // Next day midnight start booking at exactly 00:00 VN on 2026-11-16 (17:00 UTC on 2026-11-15) -> UPPER BOUND EXCLUSIVE
      const nextDayBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261116-${randomUUID().slice(0, 4).toUpperCase()}`,
          userId: null,
          guestName: 'Khách Hôm Sau',
          guestPhone: '0933445566',
          roomId: availableRoomId,
          startTime: new Date('2026-11-15T17:00:00.000Z'),
          endTime: new Date('2026-11-15T19:00:00.000Z'),
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.NO_SHOW,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: null,
        },
      });
      noShowNextDayCode = nextDayBooking.bookingCode;

      // Overnight booking starting on previous VN day at 23:00 VN (16:00 UTC) ending 01:00 VN on 2026-11-15
      const overnightBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261114-${randomUUID().slice(0, 4).toUpperCase()}`,
          userId: testUserId,
          roomId: availableRoomId,
          startTime: new Date('2026-11-14T16:00:00.000Z'),
          endTime: new Date('2026-11-14T18:00:00.000Z'),
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: null,
        },
      });
      overnightPrevDayCode = overnightBooking.bookingCode;
    });

    it('searches booking by exact bookingCode with whitespace and case insensitivity', async () => {
      // Query with spaces and lowercase
      const queryCode = `  ${userBookingCode.toLowerCase()}  `;
      const res = await request(app)
        .get(`/api/v1/admin/bookings?bookingCode=${encodeURIComponent(queryCode)}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].bookingCode).toBe(userBookingCode);
      expect(res.body.data.items[0].customer).toMatchObject({
        kind: 'USER',
        name: 'Khách Hàng Thật',
        phone: '0901112222',
      });

      // Partial prefix does NOT match (exact match only)
      const prefixRes = await request(app)
        .get(
          `/api/v1/admin/bookings?bookingCode=${encodeURIComponent(userBookingCode.slice(0, 10))}`,
        )
        .set('Authorization', `Bearer ${adminToken}`);
      expect(prefixRes.status).toBe(200);
      expect(prefixRes.body.data.items).toHaveLength(0);

      // Substring suffix does NOT match
      const suffixRes = await request(app)
        .get(`/api/v1/admin/bookings?bookingCode=${encodeURIComponent(userBookingCode.slice(-4))}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(suffixRes.status).toBe(200);
      expect(suffixRes.body.data.items).toHaveLength(0);
    });

    it('filters bookings by date using Vietnam (+07:00) day boundaries [dayStart, dayEnd)', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/bookings?date=${targetDateStr}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const codes = res.body.data.items.map((b: { bookingCode: string }) => b.bookingCode);
      // Included: day bookings and exactly 00:00 VN start booking
      expect(codes).toContain(userBookingCode);
      expect(codes).toContain(guestBookingCode);
      expect(codes).toContain(cancelledMidnightCode);

      // Excluded: exactly 00:00 VN on next day (upper bound exclusive)
      expect(codes).not.toContain(noShowNextDayCode);

      // Excluded: overnight starting on previous VN day (23:00 VN)
      expect(codes).not.toContain(overnightPrevDayCode);
    });

    it('filters bookings by status across all 4 BookingStatus values', async () => {
      const resConfirmed = await request(app)
        .get('/api/v1/admin/bookings?status=CONFIRMED')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resConfirmed.status).toBe(200);
      const confirmedCodes = resConfirmed.body.data.items.map(
        (b: { bookingCode: string }) => b.bookingCode,
      );
      expect(confirmedCodes).toContain(userBookingCode);
      expect(confirmedCodes).not.toContain(guestBookingCode);

      const resCompleted = await request(app)
        .get('/api/v1/admin/bookings?status=COMPLETED')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resCompleted.status).toBe(200);
      const completedCodes = resCompleted.body.data.items.map(
        (b: { bookingCode: string }) => b.bookingCode,
      );
      expect(completedCodes).toContain(guestBookingCode);
      expect(completedCodes).not.toContain(userBookingCode);

      const resCancelled = await request(app)
        .get('/api/v1/admin/bookings?status=CANCELLED')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resCancelled.status).toBe(200);
      const cancelledCodes = resCancelled.body.data.items.map(
        (b: { bookingCode: string }) => b.bookingCode,
      );
      expect(cancelledCodes).toContain(cancelledMidnightCode);

      const resNoShow = await request(app)
        .get('/api/v1/admin/bookings?status=NO_SHOW')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resNoShow.status).toBe(200);
      const noShowCodes = resNoShow.body.data.items.map(
        (b: { bookingCode: string }) => b.bookingCode,
      );
      expect(noShowCodes).toContain(noShowNextDayCode);
    });

    it('combines bookingCode, date, and status with AND logic', async () => {
      const resMatch = await request(app)
        .get(
          `/api/v1/admin/bookings?date=${targetDateStr}&status=COMPLETED&bookingCode=${guestBookingCode}`,
        )
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resMatch.status).toBe(200);
      expect(resMatch.body.data.items).toHaveLength(1);
      expect(resMatch.body.data.items[0].bookingCode).toBe(guestBookingCode);
      expect(resMatch.body.data.items[0].customer.kind).toBe('GUEST');

      // Confirmed status with guest booking code -> 0 results
      const resMismatch = await request(app)
        .get(
          `/api/v1/admin/bookings?date=${targetDateStr}&status=CONFIRMED&bookingCode=${guestBookingCode}`,
        )
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resMismatch.status).toBe(200);
      expect(resMismatch.body.data.items).toHaveLength(0);
      expect(resMismatch.body.data.pagination.total).toBe(0);
    });

    it('handles pagination properly with stable order and returns empty array on out-of-range page', async () => {
      const page1Res = await request(app)
        .get('/api/v1/admin/bookings?limit=2&page=1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(page1Res.status).toBe(200);
      expect(page1Res.body.data.items.length).toBeGreaterThanOrEqual(2);
      const page1Ids = page1Res.body.data.items.map((b: { id: string }) => b.id);

      const page2Res = await request(app)
        .get('/api/v1/admin/bookings?limit=2&page=2')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(page2Res.status).toBe(200);
      expect(page2Res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const page2Ids = page2Res.body.data.items.map((b: { id: string }) => b.id);

      // Verify no duplicate IDs between consecutive pages (stable pagination)
      const duplicateIds = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(duplicateIds).toHaveLength(0);

      const res = await request(app)
        .get('/api/v1/admin/bookings?page=99999&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.page).toBe(99999);
      expect(res.body.data.pagination.limit).toBe(10);
    });
  });

  describe('Concurrency & Double-Booking Prevention (Real MySQL Row Locking)', () => {
    it('prevents double-booking when two guest requests target the same room and slot simultaneously', async () => {
      const start = new Date(Date.now() + 120 * 60 * 60 * 1000);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      // Send concurrent requests
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/admin/bookings/guest')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            roomId: availableRoomId,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            guestName: 'Guest Contender 1',
            guestPhone: '0901000001',
          }),
        request(app)
          .post('/api/v1/admin/bookings/guest')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            roomId: availableRoomId,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            guestName: 'Guest Contender 2',
            guestPhone: '0901000002',
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Exactly one booking row exists in DB for this slot
      const committedBookings = await prisma.booking.findMany({
        where: {
          roomId: availableRoomId,
          startTime: start,
          endTime: end,
        },
      });
      expect(committedBookings).toHaveLength(1);
    });

    it('prevents double-booking when guest and customer requests target the same slot simultaneously', async () => {
      const start = new Date(Date.now() + 130 * 60 * 60 * 1000);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const [resCustomer, resGuest] = await Promise.all([
        request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${customerToken}`).send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        }),
        request(app)
          .post('/api/v1/admin/bookings/guest')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            roomId: availableRoomId,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            guestName: 'Guest Racing Customer',
            guestPhone: '0902000002',
          }),
      ]);

      const statuses = [resCustomer.status, resGuest.status].sort();
      expect(statuses).toEqual([201, 409]);

      const committedBookings = await prisma.booking.findMany({
        where: {
          roomId: availableRoomId,
          startTime: start,
          endTime: end,
        },
      });
      expect(committedBookings).toHaveLength(1);
    });

    it('allows boundary touching between guest and customer bookings', async () => {
      const slot1Start = new Date(Date.now() + 140 * 60 * 60 * 1000);
      slot1Start.setUTCMinutes(0, 0, 0);
      const slot1End = new Date(slot1Start.getTime() + 60 * 60 * 1000);

      // Slot 2 touches boundary: start = slot1End
      const slot2Start = new Date(slot1End.getTime());
      const slot2End = new Date(slot2Start.getTime() + 60 * 60 * 1000);

      const guestRes = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: availableRoomId,
          startTime: slot1Start.toISOString(),
          endTime: slot1End.toISOString(),
          guestName: 'Guest Slot 1',
          guestPhone: '0903000001',
        });
      expect(guestRes.status).toBe(201);

      const customerRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: availableRoomId,
          startTime: slot2Start.toISOString(),
          endTime: slot2End.toISOString(),
        });
      expect(customerRes.status).toBe(201);
    });
  });

  describe('PATCH /api/v1/admin/bookings/:id/payment (Real DB Transactions & Locking)', () => {
    it('successfully updates paymentStatus to PAID with CASH', async () => {
      const start = new Date(Date.now() + 150 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261026-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: null,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'CASH' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe('PAID');
      expect(res.body.data.paymentMethod).toBe('CASH');

      const persisted = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(persisted?.paymentStatus).toBe(PaymentStatus.PAID);
      expect(persisted?.paymentMethod).toBe(PaymentMethod.CASH);
    });

    it('successfully updates paymentStatus to PAID with QR', async () => {
      const start = new Date(Date.now() + 155 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261026-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          guestName: 'Guest QR Tester',
          guestPhone: '0904000001',
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: null,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'QR' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe('PAID');
      expect(res.body.data.paymentMethod).toBe('QR');

      const persisted = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(persisted?.paymentStatus).toBe(PaymentStatus.PAID);
      expect(persisted?.paymentMethod).toBe(PaymentMethod.QR);
    });

    it('is idempotent when confirming already paid booking', async () => {
      const start = new Date(Date.now() + 160 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261026-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.CASH,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'CASH' });

      expect(res.status).toBe(200);
      expect(res.body.data.paymentStatus).toBe('PAID');
    });

    it('returns 409 when attempting to pay a CANCELLED booking', async () => {
      const start = new Date(Date.now() + 165 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261026-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CANCELLED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'CASH' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    });
  });

  describe('PATCH /api/v1/admin/bookings/:id/cancel (Real DB Transactions & Locking)', () => {
    it('cancels confirmed booking and stores cancellation reason', async () => {
      const start = new Date(Date.now() + 170 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261026-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Sự cố bảo trì đột xuất' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(res.body.data.cancellationReason).toBe('Sự cố bảo trì đột xuất');

      const persisted = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(persisted?.status).toBe(BookingStatus.CANCELLED);
      expect(persisted?.cancellationReason).toBe('Sự cố bảo trì đột xuất');
    });

    it('rejects cancelling COMPLETED booking with 409 BOOKING_STATE_CONFLICT', async () => {
      const start = new Date(Date.now() - 10 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261026-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.COMPLETED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.CASH,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Hủy đơn hoàn tất' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    });

    it('is idempotent when cancelling already CANCELLED booking', async () => {
      const start = new Date(Date.now() + 175 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261026-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CANCELLED,
          cancellationReason: 'Đã hủy trước đó',
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Hủy lần nữa' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  describe('AC5: Check-in / Complete Booking Flow (CONFIRMED -> COMPLETED)', () => {
    it('successfully transitions an ended CONFIRMED booking to COMPLETED', async () => {
      const start = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261027-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.CASH,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');

      // Verify persisted state in DB
      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking?.status).toBe(BookingStatus.COMPLETED);
    });

    it('returns 409 BOOKING_STATE_CONFLICT when completing CANCELLED booking', async () => {
      const start = new Date(Date.now() + 185 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261028-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CANCELLED,
          cancellationReason: 'Khách bận',
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    });
  });

  describe('AC6: Mark No-Show Flow (CONFIRMED -> NO_SHOW)', () => {
    it('successfully transitions CONFIRMED booking to NO_SHOW and persists in DB', async () => {
      const start = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261029-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/no-show`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('NO_SHOW');

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking?.status).toBe(BookingStatus.NO_SHOW);
    });
  });

  describe('AC7: Lazy Evaluation of Overdue Bookings', () => {
    it('automatically transitions past overdue CONFIRMED bookings to NO_SHOW on query', async () => {
      // Overdue booking: 5 hours ago to 3 hours ago
      const pastStart = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const pastEnd = new Date(Date.now() - 3 * 60 * 60 * 1000);

      const overdueBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261030-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: pastStart,
          endTime: pastEnd,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      // Query bookings as admin
      const res = await request(app)
        .get(`/api/v1/admin/bookings?bookingCode=${overdueBooking.bookingCode}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe('NO_SHOW');

      // Verify in DB that status transitioned to NO_SHOW
      const updated = await prisma.booking.findUnique({ where: { id: overdueBooking.id } });
      expect(updated?.status).toBe(BookingStatus.NO_SHOW);
    });
  });

  describe('AC8: Revenue Query (Actual vs Potential Revenue)', () => {
    it('computes actualRevenue strictly from PAID bookings and potentialRevenue from active bookings', async () => {
      const codePrefix = randomUUID().slice(0, 6).toUpperCase();

      // Create 1 PAID booking (200.00)
      const start1 = new Date(Date.now() + 200 * 60 * 60 * 1000);
      const end1 = new Date(start1.getTime() + 1 * 60 * 60 * 1000);
      await prisma.booking.create({
        data: {
          bookingCode: `CS-${codePrefix}-01`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start1,
          endTime: end1,
          totalAmount: new Prisma.Decimal('200.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.QR,
        },
      });

      // Create 1 UNPAID booking (400.00)
      const start2 = new Date(Date.now() + 205 * 60 * 60 * 1000);
      const end2 = new Date(start2.getTime() + 2 * 60 * 60 * 1000);
      await prisma.booking.create({
        data: {
          bookingCode: `CS-${codePrefix}-02`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: start2,
          endTime: end2,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      // Query revenue for the test room
      const res = await request(app)
        .get(`/api/v1/admin/revenue?roomId=${availableRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const actualNum = Number(res.body.data.actualRevenue);
      const potentialNum = Number(res.body.data.potentialRevenue);
      const unpaidNum = Number(res.body.data.unpaidRevenue);

      // actualRevenue must be at least 200.00 and potential at least 600.00
      expect(actualNum).toBeGreaterThanOrEqual(200);
      expect(potentialNum).toBeGreaterThanOrEqual(600);
      expect(unpaidNum).toBeGreaterThanOrEqual(400);
      expect(potentialNum).toBeCloseTo(actualNum + unpaidNum, 2);
    });
  });
});
