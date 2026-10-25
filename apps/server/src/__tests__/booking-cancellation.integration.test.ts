import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role, RoomStatus, BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';

describe('Customer Cancellation API Integration Tests (Real MySQL Database & Locking)', () => {
  const testPrefix = `test_cancel_${randomUUID()}`;

  let testUser1Id: string;
  let customer1Token: string;
  let testUser2Id: string;
  let customer2Token: string;
  let adminToken: string;

  let availableRoomId: string;

  beforeAll(async () => {
    // Create customer 1
    const user1 = await prisma.user.create({
      data: {
        email: `${testPrefix}_user1@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Customer One',
        role: Role.CUSTOMER,
      },
    });
    testUser1Id = user1.id;
    customer1Token = generateToken({ sub: testUser1Id, role: Role.CUSTOMER });

    // Create customer 2
    const user2 = await prisma.user.create({
      data: {
        email: `${testPrefix}_user2@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Customer Two',
        role: Role.CUSTOMER,
      },
    });
    testUser2Id = user2.id;
    customer2Token = generateToken({ sub: testUser2Id, role: Role.CUSTOMER });

    // Admin token
    adminToken = generateToken({ sub: `admin_${randomUUID()}`, role: Role.ADMIN });

    // Create an AVAILABLE room
    const room = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room`,
        capacity: 6,
        pricePerHour: new Prisma.Decimal('200.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    availableRoomId = room.id;
  });

  afterAll(async () => {
    // Delete in FK order: bookings -> rooms -> users
    await prisma.booking.deleteMany({
      where: { roomId: availableRoomId },
    });

    await prisma.room.deleteMany({
      where: { id: availableRoomId },
    });

    await prisma.user.deleteMany({
      where: { id: { in: [testUser1Id, testUser2Id] } },
    });

    await prisma.$disconnect();
  });

  describe('AC1: Successful Cancellation (>= 1 hour before start)', () => {
    it('cancels CONFIRMED booking >= 1 hour ahead, transitions status to CANCELLED and preserves amount/payment fields', async () => {
      // Start in 3 hours
      const start = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          note: 'Ghi chú ban đầu',
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: null,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(booking.id);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(res.body.data.totalAmount).toBe('400.00');
      expect(res.body.data.paymentStatus).toBe('UNPAID');
      expect(res.body.data.note).toBe('Ghi chú ban đầu');

      // Verify in DB
      const dbBooking = await prisma.booking.findUnique({
        where: { id: booking.id },
      });
      expect(dbBooking).not.toBeNull();
      expect(dbBooking!.status).toBe(BookingStatus.CANCELLED);
      expect(dbBooking!.totalAmount.toFixed(2)).toBe('400.00');
      expect(dbBooking!.paymentStatus).toBe(PaymentStatus.UNPAID);
      expect(dbBooking!.note).toBe('Ghi chú ban đầu');
    });

    it('cancels CONFIRMED booking at exactly 60 minutes before start', async () => {
      // Start in exactly 60 minutes + 200ms buffer for test execution
      const start = new Date(Date.now() + 60 * 60 * 1000 + 500);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking!.status).toBe(BookingStatus.CANCELLED);
    });

    it('releases the slot in availability so another customer can book the exact same slot', async () => {
      // Always 09:00–11:00 Vietnam time on a future day, regardless of the CI clock.
      const base = new Date(Date.now());
      base.setUTCDate(base.getUTCDate() + 2);
      base.setUTCHours(2, 0, 0, 0);
      const start = new Date(base.getTime());
      const end = new Date(base.getTime() + 2 * 60 * 60 * 1000);

      // Customer 1 creates and cancels a booking
      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .expect(200);

      // Now customer 2 books the exact same slot via create booking endpoint
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.room.id).toBe(availableRoomId);
    });
  });

  describe('AC2: Policy Violation (< 1 hour before start / past)', () => {
    it('rejects cancellation when start time is less than 60 minutes away (e.g. 45 mins) with 400 and preserves CONFIRMED', async () => {
      const start = new Date(Date.now() + 45 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('CANCELLATION_POLICY_VIOLATION');
      expect(res.body.message).toBe('Chỉ được hủy đặt phòng trước thời gian bắt đầu ít nhất 1 giờ');

      // Verify DB remains CONFIRMED
      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking!.status).toBe(BookingStatus.CONFIRMED);
    });

    it('rejects cancellation when start time is in the past', async () => {
      const start = new Date(Date.now() - 30 * 60 * 1000); // 30m ago
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CANCELLATION_POLICY_VIOLATION');

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking!.status).toBe(BookingStatus.CONFIRMED);
    });
  });

  describe('IDOR & Security Isolation', () => {
    it('returns 404 BOOKING_NOT_FOUND when Customer B attempts to cancel Customer A booking', async () => {
      const start = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id, // Customer A
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      // Customer B attempts to cancel Customer A's booking
      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer2Token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
      expect(res.body.message).toBe('Không tìm thấy đặt phòng');

      // Verify DB was NOT changed
      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking!.status).toBe(BookingStatus.CONFIRMED);
    });

    it('returns 404 BOOKING_NOT_FOUND for non-existent booking UUID', async () => {
      const nonExistentId = randomUUID();
      const res = await request(app)
        .patch(`/api/v1/bookings/${nonExistentId}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
    });

    it('returns 403 FORBIDDEN when ADMIN attempts to call customer cancel endpoint', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('Idempotency & State Conflict', () => {
    it('returns 200 OK with CANCELLED status when booking was already cancelled (idempotent)', async () => {
      const start = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CANCELLED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('returns 409 BOOKING_STATE_CONFLICT when booking is in COMPLETED status', async () => {
      const start = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.COMPLETED,
          paymentStatus: PaymentStatus.PAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
      expect(res.body.message).toBe('Chỉ có thể hủy đơn đặt phòng ở trạng thái đã xác nhận');
    });
  });

  describe('Concurrency & Atomic Locking (Double-Cancel Race)', () => {
    it('handles two concurrent cancel requests on the same booking safely without corrupting data', async () => {
      const start = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      // Send both requests concurrently via Promise.all
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/v1/bookings/${booking.id}/cancel`)
          .set('Authorization', `Bearer ${customer1Token}`),
        request(app)
          .patch(`/api/v1/bookings/${booking.id}/cancel`)
          .set('Authorization', `Bearer ${customer1Token}`),
      ]);

      // Both must succeed with 200 OK (one performed transition, one returned idempotent CANCELLED)
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data.status).toBe('CANCELLED');
      expect(res2.body.data.status).toBe('CANCELLED');

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking!.status).toBe(BookingStatus.CANCELLED);
    });

    it('evaluates cancellation policy AFTER acquiring lock so lock-wait crossing 1-hour boundary is rejected (Finding 1 regression)', async () => {
      // Start in 60 minutes + 800ms
      const start = new Date(Date.now() + 60 * 60 * 1000 + 800);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      let releaseLock!: () => void;
      const holdLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });

      let onLockAcquired!: () => void;
      const lockAcquired = new Promise<void>((resolve) => {
        onLockAcquired = resolve;
      });

      // Transaction 1 locks the booking row
      const blockerTx = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${booking.id} FOR UPDATE`;
          onLockAcquired();
          await holdLock;
        },
        { timeout: 15000 },
      );

      // Wait until blocker transaction holds the lock
      await lockAcquired;

      // Spy on bookingRepository.cancelBooking to synchronize right when request enters cancellation logic
      let onCancelEntered!: () => void;
      const cancelEntered = new Promise<void>((resolve) => {
        onCancelEntered = resolve;
      });

      const originalCancel = bookingRepository.cancelBooking.bind(bookingRepository);
      let requestEntryTime: number | null = null;
      const cancelSpy = vi
        .spyOn(bookingRepository, 'cancelBooking')
        .mockImplementation(async (userId, id, clock) => {
          requestEntryTime = Date.now();
          onCancelEntered();
          return originalCancel(userId, id, clock);
        });

      try {
        let cancelResolved = false;
        // While booking row is locked by Transaction 1, actively send the cancellation request
        // (using .end() to guarantee HTTP request is dispatched immediately)
        const cancelResponsePromise = new Promise<request.Response>((resolve, reject) => {
          request(app)
            .patch(`/api/v1/bookings/${booking.id}/cancel`)
            .set('Authorization', `Bearer ${customer1Token}`)
            .end((err, res) => {
              cancelResolved = true;
              if (err) reject(err);
              else resolve(res);
            });
        });

        // Wait until cancellation request enters cancelBooking flow
        await cancelEntered;
        expect(requestEntryTime).not.toBeNull();
        // Crucial proof: when the request entered cancelBooking, start was STILL >= 60 minutes away
        expect(start.getTime() - requestEntryTime!).toBeGreaterThanOrEqual(60 * 60 * 1000);

        // Verify that the cancellation request is actively waiting and has not resolved
        await new Promise((r) => setTimeout(r, 150));
        expect(cancelResolved).toBe(false);

        // While request is confirmed waiting on the lock, wait until time crosses the 60-minute threshold
        while (start.getTime() - Date.now() >= 60 * 60 * 1000) {
          await new Promise((r) => setTimeout(r, 20));
        }
        // Add a small buffer past the 60-minute mark
        await new Promise((r) => setTimeout(r, 50));
        expect(start.getTime() - Date.now()).toBeLessThan(60 * 60 * 1000);

        // Confirm that the request is STILL waiting on the lock across the 60-minute boundary
        expect(cancelResolved).toBe(false);

        // Now release blocker transaction lock so cancellation query can acquire the lock
        releaseLock();
        await blockerTx;

        // Cancellation request now acquires lock and evaluates current server time
        const res = await cancelResponsePromise;

        expect(cancelResolved).toBe(true);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('CANCELLATION_POLICY_VIOLATION');
        expect(res.body.message).toBe(
          'Chỉ được hủy đặt phòng trước thời gian bắt đầu ít nhất 1 giờ',
        );

        // Verify in DB that booking remains CONFIRMED
        const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
        expect(dbBooking!.status).toBe(BookingStatus.CONFIRMED);
      } finally {
        releaseLock();
        await blockerTx.catch(() => {});
        cancelSpy.mockRestore();
      }
    });

    it('cancels CONFIRMED booking at exact 60 minutes mark using fixed clock (0ms buffer)', async () => {
      const fixedNow = new Date('2026-10-25T08:00:00.000Z');
      const start = new Date('2026-10-25T09:00:00.000Z'); // exactly 60 minutes
      const end = new Date('2026-10-25T11:00:00.000Z');

      const booking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261025-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUser1Id,
          startTime: start,
          endTime: end,
          totalAmount: new Prisma.Decimal('400.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const result = await bookingRepository.cancelBooking(testUser1Id, booking.id, () => fixedNow);

      expect(result.status).toBe('CANCELLED');

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking!.status).toBe(BookingStatus.CANCELLED);
    });
  });
});
