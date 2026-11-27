import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import nodemailer from 'nodemailer';
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
import { testBookingCode } from './support/test-booking-code.js';
import { EmailOutboxService, emailOutboxService } from '../services/email-outbox.service.js';
import { NotificationService } from '../services/notification.service.js';
import { bookingRepository } from '../repositories/booking.repository.js';

describe('Admin Reschedule API Integration Tests (Real MySQL & Concurrency, CWB-98)', () => {
  const testPrefix = `test_admin_resched_${randomUUID().slice(0, 8)}`;

  let adminId: string;
  let adminToken: string;
  let customerId: string;
  let customerToken: string;
  let lockedCustomerId: string;

  let room1Id: string;
  let room2Id: string;
  let maintenanceRoomId: string;

  // Base future day (+4 days, VN UTC+7)
  const baseDate = new Date();
  baseDate.setUTCDate(baseDate.getUTCDate() + 4);
  const dateStr = new Date(baseDate.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const makeIso = (hourVN: number, minuteVN = 0) => {
    const utcDate = new Date(`${dateStr}T00:00:00.000+07:00`);
    return new Date(utcDate.getTime() + (hourVN * 60 + minuteVN) * 60 * 1000).toISOString();
  };

  const createdUserIds: string[] = [];
  const createdRoomIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `${testPrefix}_admin@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Admin Reschedule Tester',
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;
    adminToken = generateToken({ sub: adminId, role: Role.ADMIN });
    createdUserIds.push(adminId);

    const customer = await prisma.user.create({
      data: {
        email: `${testPrefix}_cust@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Customer Reschedule Tester',
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
      },
    });
    customerId = customer.id;
    customerToken = generateToken({ sub: customerId, role: Role.CUSTOMER });
    createdUserIds.push(customerId);

    const lockedCustomer = await prisma.user.create({
      data: {
        email: `${testPrefix}_locked@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Locked Customer',
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
        lockedAt: new Date(),
        lockReason: 'Spam test',
      },
    });
    lockedCustomerId = lockedCustomer.id;
    createdUserIds.push(lockedCustomerId);

    const r1 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room100k`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    room1Id = r1.id;
    createdRoomIds.push(room1Id);

    const r2 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room200k`,
        capacity: 8,
        pricePerHour: new Prisma.Decimal('200000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    room2Id = r2.id;
    createdRoomIds.push(room2Id);

    const rMaint = await prisma.room.create({
      data: {
        name: `${testPrefix}_Maint`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100000.00'),
        status: RoomStatus.MAINTENANCE,
      },
    });
    maintenanceRoomId = rMaint.id;
    createdRoomIds.push(maintenanceRoomId);
  });

  afterAll(async () => {
    await prisma.closure.deleteMany({
      where: {
        OR: [{ roomId: { in: createdRoomIds } }, { createdById: { in: createdUserIds } }],
      },
    });
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [{ userId: { in: createdUserIds } }, { roomId: { in: createdRoomIds } }],
      },
      select: { id: true },
    });
    const bookingIds = bookings.map((b) => b.id);
    if (bookingIds.length > 0) {
      await prisma.emailOutbox.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.auditEvent.deleteMany({
        where: { entityType: 'BOOKING', entityId: { in: bookingIds } },
      });
      await prisma.refund.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    await prisma.roomStatusHistory.deleteMany({ where: { roomId: { in: createdRoomIds } } });
    await prisma.room.deleteMany({ where: { id: { in: createdRoomIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it('enforces auth: 401 without token and 403 for CUSTOMER role', async () => {
    const id = randomUUID();
    const payload = {
      startTime: makeIso(9, 0),
      endTime: makeIso(11, 0),
      reason: 'Auth check',
    };

    const unauth = await request(app).patch(`/api/v1/admin/bookings/${id}`).send(payload);
    expect(unauth.status).toBe(401);

    const cust = await request(app)
      .patch(`/api/v1/admin/bookings/${id}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send(payload);
    expect(cust.status).toBe(403);
  });

  it('reschedules UNPAID customer booking (<30m lead time & locked account), preserves bookingCode, audits ADMIN, and delivers email with reason', async () => {
    const code = testBookingCode('20261201');
    const booking = await prisma.booking.create({
      data: {
        bookingCode: code,
        userId: customerId,
        roomId: room1Id,
        startTime: new Date(makeIso(8, 0)),
        endTime: new Date(makeIso(10, 0)),
        totalAmount: new Prisma.Decimal('200000.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });
    await prisma.emailOutbox.create({
      data: {
        kind: 'BOOKING_REMINDER',
        bookingId: booking.id,
        eventKey: '',
        status: 'QUEUED',
      },
    });

    // Test HTTP reschedule to room2 (200k/h) for 2 hours -> 400k (prevent async kick race)
    const kickSpy = vi.spyOn(emailOutboxService, 'kick').mockImplementation(() => {});
    try {
      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: room2Id,
          startTime: makeIso(10, 0),
          endTime: makeIso(12, 0),
          reason: 'Dời sang phòng lớn hơn',
          note: 'Chuẩn bị máy chiếu',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.bookingCode).toBe(code);
      expect(res.body.data.room.id).toBe(room2Id);
      expect(res.body.data.totalAmount).toBe('400000.00');
      expect(res.body.data.note).toBe('Chuẩn bị máy chiếu');

      // Old BOOKING_REMINDER deleted, BOOKING_RESCHEDULED queued
      const reminders = await prisma.emailOutbox.count({
        where: { bookingId: booking.id, kind: 'BOOKING_REMINDER' },
      });
      expect(reminders).toBe(0);
      const rescheduledOutbox = await prisma.emailOutbox.findFirst({
        where: { bookingId: booking.id, kind: 'BOOKING_RESCHEDULED' },
      });
      expect(rescheduledOutbox?.status).toBe('QUEUED');

      // Verify audit event
      const audit = await prisma.auditEvent.findFirst({
        where: { entityType: 'BOOKING', entityId: booking.id, action: 'BOOKING_RESCHEDULED' },
        orderBy: { sequence: 'desc' },
      });
      expect(audit?.actorRole).toBe('ADMIN');
      expect(audit?.actorId).toBe(adminId);
      expect((audit?.after as Record<string, unknown>)?.reason).toBe('Dời sang phòng lớn hơn');

      // Verify EmailOutboxService renders admin reason
      const sendMail = vi.fn().mockResolvedValue({});
      const transportSpy = vi
        .spyOn(nodemailer, 'createTransport')
        .mockReturnValue({ sendMail } as never);
      try {
        const notification = new NotificationService({
          smtpHost: 'localhost',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: 'u',
          smtpPass: 'p',
          smtpFrom: 'noreply@cospace.test',
        });
        const outboxWorker = new EmailOutboxService(notification, prisma);
        await outboxWorker.processDue(new Date(Date.now() + 5_000), 20);
        const sentToCustomer = sendMail.mock.calls.find((c) =>
          String((c[0] as { to: string }).to).includes(`${testPrefix}_cust@example.com`),
        );
        expect(sentToCustomer).toBeDefined();
        expect((sentToCustomer![0] as { html: string }).html).toContain('Dời sang phòng lớn hơn');
      } finally {
        transportSpy.mockRestore();
      }
    } finally {
      kickSpy.mockRestore();
    }

    // Direct repository clock test: allows < 30m lead time and ongoing un-checked-in booking on locked user
    const nowSlot = new Date(makeIso(14, 0));
    const lockedBooking = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261202'),
        userId: lockedCustomerId,
        roomId: room1Id,
        startTime: new Date(nowSlot.getTime() - 30 * 60 * 1000), // 13:30 VN (started)
        endTime: new Date(nowSlot.getTime() + 60 * 60 * 1000), // 15:00 VN (not ended)
        totalAmount: new Prisma.Decimal('150000.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    const evalClock = new Date(nowSlot.getTime() + 20 * 60 * 1000); // 14:20 VN
    const nextStart = new Date(nowSlot.getTime() + 30 * 60 * 1000); // 14:30 VN (only 10m away)
    const nextEnd = new Date(nextStart.getTime() + 60 * 60 * 1000); // 15:30 VN

    const moved = await bookingRepository.rescheduleBookingForAdmin(
      lockedBooking.id,
      {
        startTime: nextStart.toISOString(),
        endTime: nextEnd.toISOString(),
        reason: 'Dời cho tài khoản đang khóa',
      },
      { id: adminId, role: Role.ADMIN },
      evalClock,
    );
    expect(moved.startTime.toISOString()).toBe(nextStart.toISOString());
  });

  it('reschedules GUEST booking without enqueueing email', async () => {
    const booking = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261203'),
        userId: null,
        guestName: 'Khach Vang Lai',
        guestPhone: '0911223344',
        roomId: room1Id,
        startTime: new Date(makeIso(16, 0)),
        endTime: new Date(makeIso(17, 0)),
        totalAmount: new Prisma.Decimal('100000.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startTime: makeIso(17, 0),
        endTime: makeIso(18, 0),
        reason: 'Khách đến trễ',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.customer.kind).toBe('GUEST');
    const outboxCount = await prisma.emailOutbox.count({ where: { bookingId: booking.id } });
    expect(outboxCount).toBe(0);
  });

  it('handles PAID bookings: allows equal total without flag, requires acknowledgePriceDelta on mismatch (409 -> 200), and keeps PAID + revenue accurate', async () => {
    const paidBooking = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261204'),
        userId: customerId,
        roomId: room1Id, // 100k/h
        startTime: new Date(makeIso(8, 0)),
        endTime: new Date(makeIso(10, 0)), // 200k
        totalAmount: new Prisma.Decimal('200000.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.QR,
        paidAt: new Date(),
      },
    });

    // Same total (2h on room1 vs 1h on room2 = 200k) succeeds without acknowledgePriceDelta
    const equalRes = await request(app)
      .patch(`/api/v1/admin/bookings/${paidBooking.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: room2Id,
        startTime: makeIso(8, 0),
        endTime: makeIso(9, 0),
        reason: 'Đổi phòng cùng giá',
      });
    expect(equalRes.status).toBe(200);
    expect(equalRes.body.data.totalAmount).toBe('200000.00');
    expect(equalRes.body.data.paymentStatus).toBe('PAID');

    // Different total (2h on room2 = 400k, delta +200k) without acknowledgePriceDelta -> 409
    const auditCountBeforeMismatch = await prisma.auditEvent.count({
      where: { entityType: 'BOOKING', entityId: paidBooking.id },
    });
    const mismatchRes = await request(app)
      .patch(`/api/v1/admin/bookings/${paidBooking.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: room2Id,
        startTime: makeIso(8, 0),
        endTime: makeIso(10, 0),
        reason: 'Khách kéo dài thêm 1 giờ',
      });
    expect(mismatchRes.status).toBe(409);
    expect(mismatchRes.body.code).toBe('PAID_BOOKING_PRICE_MISMATCH');
    expect(mismatchRes.body.details).toEqual({
      previousTotal: '200000.00',
      newTotal: '400000.00',
      difference: '200000.00',
    });

    // Verify DB rollback on 409: booking row and audit trail unchanged
    const afterMismatchRow = await prisma.booking.findUniqueOrThrow({
      where: { id: paidBooking.id },
    });
    expect(afterMismatchRow.totalAmount.toFixed(2)).toBe('200000.00');
    expect(afterMismatchRow.endTime.toISOString()).toBe(makeIso(9, 0));
    expect(
      await prisma.auditEvent.count({ where: { entityType: 'BOOKING', entityId: paidBooking.id } }),
    ).toBe(auditCountBeforeMismatch);

    // With acknowledgePriceDelta: true -> 200, updates totalAmount & keeps PAID
    const ackRes = await request(app)
      .patch(`/api/v1/admin/bookings/${paidBooking.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: room2Id,
        startTime: makeIso(8, 0),
        endTime: makeIso(10, 0),
        reason: 'Khách kéo dài thêm 1 giờ (đã thu thêm)',
        acknowledgePriceDelta: true,
      });
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.data.totalAmount).toBe('400000.00');
    expect(ackRes.body.data.paymentStatus).toBe('PAID');

    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: 'BOOKING', entityId: paidBooking.id, action: 'BOOKING_RESCHEDULED' },
      orderBy: { sequence: 'desc' },
    });
    expect((audit?.after as Record<string, unknown>)?.priceDelta).toBe('200000.00');
    expect((audit?.after as Record<string, unknown>)?.acknowledgePriceDelta).toBe(true);

    const revBeforeRes = await request(app)
      .get(`/api/v1/admin/bookings/revenue?startDate=${dateStr}&endDate=${dateStr}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revBeforeRes.status).toBe(200);
    const revBeforeCents = Math.round(Number(revBeforeRes.body.data.actualRevenue) * 100);

    // Negative delta (400k -> 100k on room1 for 1h): 409 without flag -> 200 with flag
    const negativeMismatch = await request(app)
      .patch(`/api/v1/admin/bookings/${paidBooking.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: room1Id,
        startTime: makeIso(11, 0),
        endTime: makeIso(12, 0),
        reason: 'Đổi sang phòng nhỏ hơn',
      });
    expect(negativeMismatch.status).toBe(409);
    expect(negativeMismatch.body.code).toBe('PAID_BOOKING_PRICE_MISMATCH');
    expect(negativeMismatch.body.details).toEqual({
      previousTotal: '400000.00',
      newTotal: '100000.00',
      difference: '-300000.00',
    });

    const negativeAck = await request(app)
      .patch(`/api/v1/admin/bookings/${paidBooking.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: room1Id,
        startTime: makeIso(11, 0),
        endTime: makeIso(12, 0),
        reason: 'Đổi sang phòng nhỏ hơn (đã hoàn tiền tại quầy)',
        acknowledgePriceDelta: true,
      });
    expect(negativeAck.status).toBe(200);
    expect(negativeAck.body.data.totalAmount).toBe('100000.00');
    expect(negativeAck.body.data.paymentStatus).toBe('PAID');
    expect(negativeAck.body.data.refundedAmount).toBe('0.00');

    const revAfterRes = await request(app)
      .get(`/api/v1/admin/bookings/revenue?startDate=${dateStr}&endDate=${dateStr}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revAfterRes.status).toBe(200);
    const revAfterCents = Math.round(Number(revAfterRes.body.data.actualRevenue) * 100);
    expect(revAfterCents - revBeforeCents).toBe(-30000000);
  });

  it('rejects COMPLETED, NO_SHOW, CANCELLED, checked-in, ended bookings (409), NO_SCHEDULE_CHANGE (400), MAINTENANCE room (409), and Closure (409)', async () => {
    const statuses = [BookingStatus.COMPLETED, BookingStatus.NO_SHOW, BookingStatus.CANCELLED];
    for (const status of statuses) {
      const b = await prisma.booking.create({
        data: {
          bookingCode: testBookingCode(`2026121${statuses.indexOf(status)}`),
          userId: customerId,
          roomId: room1Id,
          startTime: new Date(makeIso(19, 0)),
          endTime: new Date(makeIso(20, 0)),
          totalAmount: new Prisma.Decimal('100000.00'),
          status,
        },
      });
      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${b.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ startTime: makeIso(20, 0), endTime: makeIso(21, 0), reason: 'Invalid state' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    }

    const checkedIn = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261215'),
        userId: customerId,
        roomId: room1Id,
        startTime: new Date(makeIso(19, 0)),
        endTime: new Date(makeIso(20, 0)),
        checkedInAt: new Date(),
        totalAmount: new Prisma.Decimal('100000.00'),
        status: BookingStatus.CONFIRMED,
      },
    });
    const checkedInRes = await request(app)
      .patch(`/api/v1/admin/bookings/${checkedIn.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: makeIso(20, 0), endTime: makeIso(21, 0), reason: 'Checked in' });
    expect(checkedInRes.status).toBe(409);
    expect(checkedInRes.body.code).toBe('BOOKING_STATE_CONFLICT');

    // Ended / lazy NO_SHOW booking (CONFIRMED, checkedInAt: null, endTime <= now) -> 409
    const endedStart = new Date('2020-01-01T02:00:00.000Z');
    const endedEnd = new Date('2020-01-01T03:00:00.000Z');
    const endedBooking = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261217'),
        userId: customerId,
        roomId: room1Id,
        startTime: endedStart,
        endTime: endedEnd,
        totalAmount: new Prisma.Decimal('100000.00'),
        status: BookingStatus.CONFIRMED,
      },
    });
    const endedRes = await request(app)
      .patch(`/api/v1/admin/bookings/${endedBooking.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: makeIso(20, 0), endTime: makeIso(21, 0), reason: 'Ended booking' });
    expect(endedRes.status).toBe(409);
    expect(endedRes.body.code).toBe('BOOKING_STATE_CONFLICT');
    const endedAfter = await prisma.booking.findUniqueOrThrow({ where: { id: endedBooking.id } });
    expect(endedAfter.startTime.toISOString()).toBe(endedStart.toISOString());
    expect(endedAfter.endTime.toISOString()).toBe(endedEnd.toISOString());

    // Exact boundary: evaluationTime === existing.endTime -> 409 BOOKING_STATE_CONFLICT
    const boundaryEnd = new Date(makeIso(12, 0));
    const boundaryBooking = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261218'),
        userId: customerId,
        roomId: room1Id,
        startTime: new Date(makeIso(11, 0)),
        endTime: boundaryEnd,
        totalAmount: new Prisma.Decimal('100000.00'),
        status: BookingStatus.CONFIRMED,
      },
    });
    await expect(
      bookingRepository.rescheduleBookingForAdmin(
        boundaryBooking.id,
        { startTime: makeIso(13, 0), endTime: makeIso(14, 0), reason: 'Boundary ended' },
        { id: adminId, role: Role.ADMIN },
        boundaryEnd,
      ),
    ).rejects.toMatchObject({ code: 'BOOKING_STATE_CONFLICT', statusCode: 409 });

    // No schedule change -> 400 NO_SCHEDULE_CHANGE
    const active = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261216'),
        userId: customerId,
        roomId: room1Id,
        startTime: new Date(makeIso(20, 0)),
        endTime: new Date(makeIso(21, 0)),
        totalAmount: new Prisma.Decimal('100000.00'),
        status: BookingStatus.CONFIRMED,
      },
    });
    const sameRes = await request(app)
      .patch(`/api/v1/admin/bookings/${active.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: room1Id,
        startTime: makeIso(20, 0),
        endTime: makeIso(21, 0),
        reason: 'Không đổi gì',
      });
    expect(sameRes.status).toBe(400);
    expect(sameRes.body.code).toBe('NO_SCHEDULE_CHANGE');

    // Target room in MAINTENANCE -> 409 ROOM_NOT_AVAILABLE
    const maintRes = await request(app)
      .patch(`/api/v1/admin/bookings/${active.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: maintenanceRoomId,
        startTime: makeIso(20, 0),
        endTime: makeIso(21, 0),
        reason: 'Phòng bảo trì',
      });
    expect(maintRes.status).toBe(409);
    expect(maintRes.body.code).toBe('ROOM_NOT_AVAILABLE');

    // Target slot overlapping Closure -> 409 ROOM_CLOSED
    await prisma.closure.create({
      data: {
        roomId: room1Id,
        startTime: new Date(makeIso(15, 0)),
        endTime: new Date(makeIso(16, 0)),
        reason: 'Vệ sinh định kỳ',
        createdById: adminId,
      },
    });
    const closedRes = await request(app)
      .patch(`/api/v1/admin/bookings/${active.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startTime: makeIso(15, 0),
        endTime: makeIso(16, 0),
        reason: 'Dời vào khung đóng cửa',
      });
    expect(closedRes.status).toBe(409);
    expect(closedRes.body.code).toBe('ROOM_CLOSED');
  });

  it('enforces overlap rules (partial, inside, boundary touching, self-overlap) and prevents concurrent double-booking', async () => {
    const overlapRoom = await prisma.room.create({
      data: {
        name: `${testPrefix}_OverlapRoom`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    createdRoomIds.push(overlapRoom.id);

    // Existing blocker 10:00 - 12:00
    await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261220'),
        userId: customerId,
        roomId: overlapRoom.id,
        startTime: new Date(makeIso(10, 0)),
        endTime: new Date(makeIso(12, 0)),
        totalAmount: new Prisma.Decimal('200000.00'),
        status: BookingStatus.CONFIRMED,
      },
    });

    // Booking A to reschedule (initially 07:00 - 09:00)
    const bookingA = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261221'),
        userId: customerId,
        roomId: overlapRoom.id,
        startTime: new Date(makeIso(7, 0)),
        endTime: new Date(makeIso(9, 0)),
        totalAmount: new Prisma.Decimal('200000.00'),
        status: BookingStatus.CONFIRMED,
      },
    });

    // Booking B to race concurrently (initially 16:00 - 18:00)
    const bookingB = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261222'),
        userId: customerId,
        roomId: overlapRoom.id,
        startTime: new Date(makeIso(16, 0)),
        endTime: new Date(makeIso(18, 0)),
        totalAmount: new Prisma.Decimal('200000.00'),
        status: BookingStatus.CONFIRMED,
      },
    });

    // 1. Partial overlap (11:00 - 13:00) -> 409
    const partial = await request(app)
      .patch(`/api/v1/admin/bookings/${bookingA.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: makeIso(11, 0), endTime: makeIso(13, 0), reason: 'Partial overlap' });
    expect(partial.status).toBe(409);
    expect(partial.body.code).toBe('BOOKING_CONFLICT');

    // 2. Inside existing booking (10:30 - 11:30) -> 409
    const inside = await request(app)
      .patch(`/api/v1/admin/bookings/${bookingA.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: makeIso(10, 30), endTime: makeIso(11, 30), reason: 'Inside overlap' });
    expect(inside.status).toBe(409);
    expect(inside.body.code).toBe('BOOKING_CONFLICT');

    // 3. Self-overlap (shift 07:00-09:00 -> 08:00-10:00, touching blocker at 10:00) -> 200
    const boundaryAndSelf = await request(app)
      .patch(`/api/v1/admin/bookings/${bookingA.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startTime: makeIso(8, 0),
        endTime: makeIso(10, 0),
        reason: 'Chạm biên & tự gối lịch',
      });
    expect(boundaryAndSelf.status).toBe(200);

    // 4. Two concurrent admin reschedule requests for bookingA and bookingB into 13:00-15:00
    const [resA, resB] = await Promise.all([
      request(app)
        .patch(`/api/v1/admin/bookings/${bookingA.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ startTime: makeIso(13, 0), endTime: makeIso(15, 0), reason: 'Race A' }),
      request(app)
        .patch(`/api/v1/admin/bookings/${bookingB.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ startTime: makeIso(13, 0), endTime: makeIso(15, 0), reason: 'Race B' }),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
    const winner = resA.status === 200 ? resA : resB;
    const loser = resA.status === 409 ? resA : resB;
    expect(winner.status).toBe(200);
    expect(loser.body.code).toBe('BOOKING_CONFLICT');

    // Verify persisted DB state after concurrency race
    const [dbA, dbB] = await Promise.all([
      prisma.booking.findUniqueOrThrow({ where: { id: bookingA.id } }),
      prisma.booking.findUniqueOrThrow({ where: { id: bookingB.id } }),
    ]);
    if (resA.status === 200) {
      expect(dbA.startTime.toISOString()).toBe(makeIso(13, 0));
      expect(dbA.endTime.toISOString()).toBe(makeIso(15, 0));
      expect(dbB.startTime.toISOString()).toBe(makeIso(16, 0));
      expect(dbB.endTime.toISOString()).toBe(makeIso(18, 0));
    } else {
      expect(dbB.startTime.toISOString()).toBe(makeIso(13, 0));
      expect(dbB.endTime.toISOString()).toBe(makeIso(15, 0));
      expect(dbA.startTime.toISOString()).toBe(makeIso(8, 0));
      expect(dbA.endTime.toISOString()).toBe(makeIso(10, 0));
    }
  });
});
