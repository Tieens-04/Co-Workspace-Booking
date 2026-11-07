import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role, RoomStatus, BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { TestAccounts } from './support/test-accounts.js';
import { EmailOutboxService } from '../services/email-outbox.service.js';
import { NotificationService } from '../services/notification.service.js';

describe('Customer Reschedule API Integration Tests (Real MySQL Database & Locking)', () => {
  const accounts = new TestAccounts();
  beforeAll(() => accounts.persist());
  afterAll(() => accounts.cleanup());

  const testPrefix = `test_reschedule_${randomUUID().slice(0, 8)}`;

  let user1Id: string;
  let user1Token: string;
  let user2Id: string;
  let user2Token: string;

  let room1Id: string;
  let room2Id: string;
  let maintenanceRoomId: string;

  // Next week date for stable aligned testing (07:00 - 22:00 VN = 00:00 - 15:00 UTC)
  // Let's create an ISO date string for a future day (e.g. 3 days from now)
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 3);
  const dateStr = baseDate.toISOString().slice(0, 10);

  const makeIso = (hourVN: number, minuteVN = 0) => {
    // VN is UTC+7
    const utcHour = hourVN - 7;
    const hh = String(utcHour).padStart(2, '0');
    const mm = String(minuteVN).padStart(2, '0');
    return `${dateStr}T${hh}:${mm}:00.000Z`;
  };

  beforeAll(async () => {
    // 1. Create 2 test users
    const user1 = await prisma.user.create({
      data: {
        email: `${testPrefix}_u1@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Reschedule User One',
        role: Role.CUSTOMER,
      },
    });
    user1Id = user1.id;
    user1Token = generateToken({ sub: user1Id, role: Role.CUSTOMER });

    const user2 = await prisma.user.create({
      data: {
        email: `${testPrefix}_u2@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Reschedule User Two',
        role: Role.CUSTOMER,
      },
    });
    user2Id = user2.id;
    user2Token = generateToken({ sub: user2Id, role: Role.CUSTOMER });

    // 2. Create Rooms
    const r1 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room1`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    room1Id = r1.id;

    const r2 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room2`,
        capacity: 8,
        pricePerHour: new Prisma.Decimal('250000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    room2Id = r2.id;

    const rMaint = await prisma.room.create({
      data: {
        name: `${testPrefix}_RoomMaint`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100000.00'),
        status: RoomStatus.MAINTENANCE,
      },
    });
    maintenanceRoomId = rMaint.id;
  });

  afterAll(async () => {
    await prisma.emailOutbox.deleteMany({
      where: { booking: { roomId: { in: [room1Id, room2Id, maintenanceRoomId] } } },
    });
    await prisma.auditEvent.deleteMany({
      where: {
        entityId: {
          in: (
            await prisma.booking.findMany({
              where: { roomId: { in: [room1Id, room2Id, maintenanceRoomId] } },
              select: { id: true },
            })
          ).map((b) => b.id),
        },
      },
    });
    await prisma.booking.deleteMany({
      where: { roomId: { in: [room1Id, room2Id, maintenanceRoomId] } },
    });
    await prisma.room.deleteMany({
      where: { id: { in: [room1Id, room2Id, maintenanceRoomId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [user1Id, user2Id] } },
    });
  });

  it('rejects reschedule when current booking starts in < 1h with 400 RESCHEDULE_POLICY_VIOLATION', async () => {
    const nearStart = new Date(Date.now() + 45 * 60 * 1000); // 45 mins from now
    const nearEnd = new Date(nearStart.getTime() + 60 * 60 * 1000);

    const booking = await prisma.booking.create({
      data: {
        bookingCode: `CS-${randomUUID().slice(0, 8)}`,
        userId: user1Id,
        roomId: room1Id,
        startTime: nearStart,
        endTime: nearEnd,
        totalAmount: new Prisma.Decimal('100000.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        startTime: makeIso(15, 0),
        endTime: makeIso(16, 30),
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESCHEDULE_POLICY_VIOLATION');
  });

  it('rejects reschedule with 404 BOOKING_NOT_FOUND when user attempts IDOR on another user booking', async () => {
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `CS-${randomUUID().slice(0, 8)}`,
        userId: user1Id,
        roomId: room1Id,
        startTime: new Date(makeIso(8, 0)),
        endTime: new Date(makeIso(9, 30)),
        totalAmount: new Prisma.Decimal('150000.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${user2Token}`) // user 2 trying to reschedule user 1's booking
      .send({
        startTime: makeIso(15, 0),
        endTime: makeIso(16, 30),
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BOOKING_NOT_FOUND');
  });

  it('rejects reschedule with 409 PAID_BOOKING_CANNOT_RESCHEDULE when booking is already PAID', async () => {
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `CS-${randomUUID().slice(0, 8)}`,
        userId: user1Id,
        roomId: room1Id,
        startTime: new Date(makeIso(8, 0)),
        endTime: new Date(makeIso(9, 30)),
        totalAmount: new Prisma.Decimal('150000.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        startTime: makeIso(15, 0),
        endTime: makeIso(16, 30),
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAID_BOOKING_CANNOT_RESCHEDULE');
  });

  it('rejects reschedule with 409 ROOM_NOT_AVAILABLE when target room is in MAINTENANCE', async () => {
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `CS-${randomUUID().slice(0, 8)}`,
        userId: user1Id,
        roomId: room1Id,
        startTime: new Date(makeIso(8, 0)),
        endTime: new Date(makeIso(9, 30)),
        totalAmount: new Prisma.Decimal('150000.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        roomId: maintenanceRoomId,
        startTime: makeIso(15, 0),
        endTime: makeIso(16, 30),
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
  });

  describe('Overlap & Self-Exclusion Rules (AC2, AC6)', () => {

    beforeAll(async () => {
      // Create an existing booking from 10:00 to 12:00 VN on room 1
      await prisma.booking.create({
        data: {
          bookingCode: `CS-${randomUUID().slice(0, 8)}`,
          userId: user2Id,
          roomId: room1Id,
          startTime: new Date(makeIso(10, 0)),
          endTime: new Date(makeIso(12, 0)),
          totalAmount: new Prisma.Decimal('200000.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });
    });

    it('rejects partial overlap with 409 BOOKING_CONFLICT (11:00 - 13:00 vs 10:00 - 12:00)', async () => {
      const myBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-${randomUUID().slice(0, 8)}`,
          userId: user1Id,
          roomId: room1Id,
          startTime: new Date(makeIso(8, 0)),
          endTime: new Date(makeIso(9, 30)),
          totalAmount: new Prisma.Decimal('150000.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/bookings/${myBooking.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          startTime: makeIso(11, 0),
          endTime: makeIso(13, 0),
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
    });

    it('rejects inside overlap with 409 BOOKING_CONFLICT (10:30 - 11:30 inside 10:00 - 12:00)', async () => {
      const myBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-${randomUUID().slice(0, 8)}`,
          userId: user1Id,
          roomId: room1Id,
          startTime: new Date(makeIso(8, 0)),
          endTime: new Date(makeIso(9, 30)),
          totalAmount: new Prisma.Decimal('150000.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/bookings/${myBooking.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          startTime: makeIso(10, 30),
          endTime: makeIso(11, 30),
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
    });

    it('allows boundary touching with 200 OK (12:00 - 14:00 touches 10:00 - 12:00)', async () => {
      const myBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-${randomUUID().slice(0, 8)}`,
          userId: user1Id,
          roomId: room1Id,
          startTime: new Date(makeIso(8, 0)),
          endTime: new Date(makeIso(9, 30)),
          totalAmount: new Prisma.Decimal('150000.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/bookings/${myBooking.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          startTime: makeIso(12, 0),
          endTime: makeIso(14, 0),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows self-overlap with 200 OK (moving from 08:00 - 10:00 to 08:30 - 10:30 on same room)', async () => {
      // 08:30 - 10:00 was occupied by this booking itself; it should not conflict with itself!
      const myBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-${randomUUID().slice(0, 8)}`,
          userId: user1Id,
          roomId: room2Id,
          startTime: new Date(makeIso(8, 0)),
          endTime: new Date(makeIso(10, 0)),
          totalAmount: new Prisma.Decimal('500000.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/bookings/${myBooking.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          startTime: makeIso(8, 30),
          endTime: makeIso(10, 30),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.startTime).toBe(new Date(makeIso(8, 30)).toISOString());
      expect(res.body.data.endTime).toBe(new Date(makeIso(10, 30)).toISOString());
    });
  });

  describe('Concurrency & Double-Booking Protection (AC2, AC6)', () => {
    it('prevents 2 concurrent reschedule requests from double-booking the exact same slot', async () => {
      // Setup: user 1 has a booking, user 2 has a booking
      // Both try to reschedule into the exact same slot on Room 2: 15:00 - 17:00 VN
      const targetStart = makeIso(15, 0);
      const targetEnd = makeIso(17, 0);

      const b1 = await prisma.booking.create({
        data: {
          bookingCode: `CS-${randomUUID().slice(0, 8)}`,
          userId: user1Id,
          roomId: room1Id,
          startTime: new Date(makeIso(7, 0)),
          endTime: new Date(makeIso(8, 30)),
          totalAmount: new Prisma.Decimal('150000.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const b2 = await prisma.booking.create({
        data: {
          bookingCode: `CS-${randomUUID().slice(0, 8)}`,
          userId: user2Id,
          roomId: room1Id,
          startTime: new Date(makeIso(7, 0)),
          endTime: new Date(makeIso(8, 30)),
          totalAmount: new Prisma.Decimal('150000.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const req1 = request(app)
        .patch(`/api/v1/bookings/${b1.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          roomId: room2Id,
          startTime: targetStart,
          endTime: targetEnd,
        });

      const req2 = request(app)
        .patch(`/api/v1/bookings/${b2.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          roomId: room2Id,
          startTime: targetStart,
          endTime: targetEnd,
        });

      const [res1, res2] = await Promise.all([req1, req2]);
      const statuses = [res1.status, res2.status].sort();

      expect(statuses).toEqual([200, 409]);

      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(conflictRes.body.code).toBe('BOOKING_CONFLICT');
    });
  });

  describe('Price Recalculation, Audit Event & Email Outbox (AC3, AC4)', () => {
    it('preserves bookingCode, recalculates price on room switch, records audit event and enqueues outbox email', async () => {
      // Room 1: 100k/h. Room 2: 250k/h.
      // Book 1h on Room 1 (100k)
      const originalCode = `CS-${randomUUID().slice(0, 8)}`;
      const booking = await prisma.booking.create({
        data: {
          bookingCode: originalCode,
          userId: user1Id,
          roomId: room1Id,
          startTime: new Date(makeIso(18, 0)),
          endTime: new Date(makeIso(19, 0)),
          totalAmount: new Prisma.Decimal('100000.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      // Switch to Room 2 for 2 hours (19:00 - 21:00 VN) -> expected: 2 * 250k = 500k
      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          roomId: room2Id,
          startTime: makeIso(19, 0),
          endTime: makeIso(21, 0),
          note: 'Đã đổi sang phòng lớn',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bookingCode).toBe(originalCode); // preserved
      expect(res.body.data.room.id).toBe(room2Id);
      expect(res.body.data.totalAmount).toBe('500000.00');
      expect(res.body.data.note).toBe('Đã đổi sang phòng lớn');

      // Verify Audit Event
      const audit = await prisma.auditEvent.findFirst({
        where: {
          entityId: booking.id,
          action: 'BOOKING_RESCHEDULED',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(user1Id);
      expect(audit?.actorRole).toBe(Role.CUSTOMER);
      const beforePayload = audit?.before as any;
      const afterPayload = audit?.after as any;
      expect(beforePayload.roomId).toBe(room1Id);
      expect(afterPayload.roomId).toBe(room2Id);
      expect(afterPayload.totalAmount).toBe('500000.00');

      // Verify Email Outbox record
      const outbox = await prisma.emailOutbox.findUnique({
        where: {
          kind_bookingId: {
            kind: 'BOOKING_RESCHEDULED',
            bookingId: booking.id,
          },
        },
      });
      expect(outbox).not.toBeNull();
      expect(outbox?.status).toBe('QUEUED');

      // Isolate queue so other test bookings do not interfere
      await prisma.emailOutbox.updateMany({
        where: { status: 'QUEUED', bookingId: { not: booking.id } },
        data: { status: 'SKIPPED', lastError: 'TEST_ISOLATION' },
      });

      // Verify Outbox worker delivers BOOKING_RESCHEDULED via sendBookingRescheduled (Finding 1 & 3 regression)
      const mockNotifier = {
        canDeliver: () => true,
        sendBookingRescheduled: vi.fn().mockResolvedValue(true),
        sendBookingCancellation: vi.fn().mockResolvedValue(true),
      } as unknown as NotificationService;

      const worker = new EmailOutboxService(mockNotifier);
      const delivery = await worker.processDue();
      expect(delivery.sent).toBeGreaterThanOrEqual(1);
      expect(mockNotifier.sendBookingRescheduled).toHaveBeenCalledTimes(1);
      expect(mockNotifier.sendBookingRescheduled).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingCode: booking.bookingCode,
          totalAmount: '500000.00',
        }),
      );
      expect(mockNotifier.sendBookingCancellation).not.toHaveBeenCalled();

      const deliveredOutbox = await prisma.emailOutbox.findUnique({
        where: {
          kind_bookingId: {
            kind: 'BOOKING_RESCHEDULED',
            bookingId: booking.id,
          },
        },
      });
      expect(deliveredOutbox?.status).toBe('SENT');
    });
  });
});
