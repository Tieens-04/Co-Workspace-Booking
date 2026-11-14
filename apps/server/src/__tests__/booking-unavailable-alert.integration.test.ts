import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  BookingStatus,
  EmailOutboxKind,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  RoomStatus,
} from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { ENV } from '../config/env.config.js';
import { EmailOutboxService } from '../services/email-outbox.service.js';
import { NotificationService } from '../services/notification.service.js';
import { TestAccounts } from './support/test-accounts.js';

const HOUR = 3_600_000;

describe('Unavailable Booking Alerts & Handling (CWB-91, real MySQL)', () => {
  const tag = randomUUID().slice(0, 8);
  const accounts = new TestAccounts();
  const adminToken = accounts.token(Role.ADMIN);

  let customerId: string;
  let customerToken: string;
  let roomAId: string;
  let roomBId: string;
  const createdClosureIds: string[] = [];
  let seq = 0;

  // Fixed date far in the future to avoid overlapping with any other integration suites.
  const baseDay = new Date('2032-08-15T00:00:00.000+07:00');
  const vnAt = (dayOffset: number, hour: number) =>
    new Date(baseDay.getTime() + dayOffset * 24 * HOUR + hour * HOUR);

  const createBookingRecord = async (
    overrides: Partial<Prisma.BookingUncheckedCreateInput> = {},
  ) => {
    const start = overrides.startTime ? new Date(overrides.startTime) : vnAt(1, 10);
    const end = overrides.endTime
      ? new Date(overrides.endTime)
      : new Date(start.getTime() + 2 * HOUR);
    const code = `CWB91-${tag}-${++seq}`;
    return prisma.booking.create({
      data: {
        bookingCode: code,
        userId: customerId,
        roomId: roomAId,
        startTime: start,
        endTime: end,
        totalAmount: new Prisma.Decimal('200000.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        createdAt: new Date(start.getTime() - 48 * HOUR),
        ...overrides,
      },
    });
  };

  const buildMockNotifier = (shouldSucceed = true, deliverEnabled = true) => {
    const sendUnavailable = vi.fn(async () => shouldSucceed);
    const sendReminder = vi.fn(async () => shouldSucceed);
    const notifier = {
      canDeliver: () => deliverEnabled,
      sendBookingConfirmation: vi.fn(async () => shouldSucceed),
      sendBookingCancellation: vi.fn(async () => shouldSucceed),
      sendBookingRescheduled: vi.fn(async () => shouldSucceed),
      sendBookingReminder: sendReminder,
      sendPaymentReceipt: vi.fn(async () => shouldSucceed),
      sendBookingRoomUnavailable: sendUnavailable,
    } as unknown as NotificationService;
    return { notifier, sendUnavailable, sendReminder };
  };

  const isolateOutboxTo = async (bookingIds: string[]) => {
    await prisma.emailOutbox.updateMany({
      where: {
        status: 'QUEUED',
        OR: [{ bookingId: null }, { bookingId: { notIn: bookingIds } }],
      },
      data: { status: 'SKIPPED', lastError: 'TEST_ISOLATION' },
    });
  };

  beforeAll(async () => {
    await accounts.persist();
    const customer = await prisma.user.create({
      data: {
        email: `cwb91_${tag}@example.com`,
        passwordHash: '!integration-test-account',
        fullName: 'Khách CWB91',
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
      },
    });
    customerId = customer.id;
    customerToken = accounts.token(Role.CUSTOMER, customer.id);
    // Persist the customer id into TestAccounts? Wait: customer was created directly and cleaned up below.

    const roomA = await prisma.room.create({
      data: {
        name: `RoomA_${tag}`,
        capacity: 6,
        pricePerHour: new Prisma.Decimal('100000.00'),
        status: RoomStatus.AVAILABLE,
        statusHistory: {
          create: { status: RoomStatus.AVAILABLE, effectiveAt: new Date('2032-08-01T00:00:00Z') },
        },
      },
    });
    roomAId = roomA.id;

    const roomB = await prisma.room.create({
      data: {
        name: `RoomB_${tag}`,
        capacity: 8,
        pricePerHour: new Prisma.Decimal('150000.00'),
        status: RoomStatus.AVAILABLE,
        statusHistory: {
          create: { status: RoomStatus.AVAILABLE, effectiveAt: new Date('2032-08-01T00:00:00Z') },
        },
      },
    });
    roomBId = roomB.id;
  });

  afterAll(async () => {
    await prisma.closure.deleteMany({
      where: {
        OR: [{ id: { in: createdClosureIds } }, { roomId: { in: [roomAId, roomBId] } }],
      },
    });
    await prisma.booking.deleteMany({ where: { roomId: { in: [roomAId, roomBId] } } });
    await prisma.room.deleteMany({ where: { id: { in: [roomAId, roomBId] } } });
    await prisma.user.deleteMany({ where: { id: customerId } });
    await accounts.cleanup();
  });

  it('AC1 & AC5: enqueues BOOKING_ROOM_UNAVAILABLE on closure create/update ack, skips guests/boundary/other rooms, and preserves status/payment', async () => {
    const start10 = vnAt(1, 10);
    const end12 = vnAt(1, 12);

    const paidAffected = await createBookingRecord({
      roomId: roomAId,
      startTime: start10,
      endTime: end12,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.QR,
      paidAt: new Date('2032-08-14T00:00:00Z'),
    });
    const boundaryBefore = await createBookingRecord({
      roomId: roomAId,
      startTime: vnAt(1, 8),
      endTime: vnAt(1, 10),
    });
    const cancelledBooking = await createBookingRecord({
      roomId: roomAId,
      startTime: vnAt(1, 10),
      endTime: vnAt(1, 11),
      status: BookingStatus.CANCELLED,
    });
    const otherRoomBooking = await createBookingRecord({
      roomId: roomBId,
      startTime: vnAt(1, 10),
      endTime: vnAt(1, 12),
    });
    const guestBooking = await createBookingRecord({
      roomId: roomAId,
      userId: null,
      guestName: 'Khách vãng lai',
      guestPhone: '0901234567',
      startTime: vnAt(1, 10),
      endTime: vnAt(1, 12),
    });
    const extendedWindowBooking = await createBookingRecord({
      roomId: roomAId,
      startTime: vnAt(1, 13),
      endTime: vnAt(1, 15),
    });

    // Create closure over 10:00 - 12:30 with acknowledgeConflictingBookings: true
    const createRes = await request(app)
      .post('/api/v1/admin/closures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: roomAId,
        startTime: vnAt(1, 10).toISOString(),
        endTime: vnAt(1, 12).toISOString(),
        reason: 'Sửa điều hòa tầng 2',
        acknowledgeConflictingBookings: true,
      });

    expect(createRes.status).toBe(201);
    const closureId = createRes.body.data.id as string;
    createdClosureIds.push(closureId);

    const outboxAfterCreate = await prisma.emailOutbox.findMany({
      where: { kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE, eventKey: `closure:${closureId}` },
    });
    expect(outboxAfterCreate).toHaveLength(1);
    expect(outboxAfterCreate[0].bookingId).toBe(paidAffected.id);
    expect(outboxAfterCreate[0].status).toBe('QUEUED');

    for (const ignoredId of [
      boundaryBefore.id,
      cancelledBooking.id,
      otherRoomBooking.id,
      guestBooking.id,
      extendedWindowBooking.id,
    ]) {
      const rows = await prisma.emailOutbox.findMany({
        where: { bookingId: ignoredId, kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE },
      });
      expect(rows).toHaveLength(0);
    }

    // AC5: status and payment untouched
    const reloaded = await prisma.booking.findUniqueOrThrow({ where: { id: paidAffected.id } });
    expect(reloaded.status).toBe(BookingStatus.CONFIRMED);
    expect(reloaded.paymentStatus).toBe(PaymentStatus.PAID);
    expect(reloaded.paymentMethod).toBe(PaymentMethod.QR);
    expect(reloaded.totalAmount.toFixed(2)).toBe('200000.00');

    // Extend closure to cover extendedWindowBooking (10:00 - 15:00): idempotent for paidAffected, enqueues extendedWindowBooking
    const updateRes = await request(app)
      .patch(`/api/v1/admin/closures/${closureId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        endTime: vnAt(1, 15).toISOString(),
        acknowledgeConflictingBookings: true,
      });
    expect(updateRes.status).toBe(200);

    const outboxAfterUpdate = await prisma.emailOutbox.findMany({
      where: { kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE, eventKey: `closure:${closureId}` },
    });
    expect(outboxAfterUpdate.map((r) => r.bookingId).sort()).toEqual(
      [paidAffected.id, extendedWindowBooking.id].sort(),
    );

    // Deliver queued emails
    await isolateOutboxTo([paidAffected.id, extendedWindowBooking.id]);
    const { notifier, sendUnavailable } = buildMockNotifier(true, true);
    const worker = new EmailOutboxService(notifier);
    const processResult = await worker.processDue(vnAt(1, 8), 50);
    expect(processResult.sent).toBe(2);
    expect(sendUnavailable).toHaveBeenCalledTimes(2);
    expect(sendUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingCode: paidAffected.bookingCode,
        cause: 'CLOSURE',
        reason: 'Sửa điều hòa tầng 2',
        isPaid: true,
      }),
    );

    // Facility-wide closure (roomId: null) also enqueues for otherRoomBooking
    const facilityRes = await request(app)
      .post('/api/v1/admin/closures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: null,
        startTime: vnAt(1, 10).toISOString(),
        endTime: vnAt(1, 12).toISOString(),
        reason: 'Cắt điện toàn tòa nhà',
        acknowledgeConflictingBookings: true,
      });
    expect(facilityRes.status).toBe(201);
    const facilityClosureId = facilityRes.body.data.id as string;
    createdClosureIds.push(facilityClosureId);

    const facilityRows = await prisma.emailOutbox.findMany({
      where: {
        kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE,
        eventKey: `closure:${facilityClosureId}`,
      },
    });
    expect(facilityRows.map((r) => r.bookingId)).toContain(otherRoomBooking.id);
    expect(facilityRows.map((r) => r.bookingId)).toContain(paidAffected.id);
  });

  it('AC1 & AC5: enqueues separate outbox rows on room MAINTENANCE then ARCHIVED transition, and survives SMTP failure', async () => {
    const targetBooking = await createBookingRecord({
      roomId: roomBId,
      startTime: vnAt(3, 10),
      endTime: vnAt(3, 12),
    });
    const guestBooking = await createBookingRecord({
      roomId: roomBId,
      userId: null,
      guestName: 'Khách B',
      guestPhone: '0909998887',
      startTime: vnAt(3, 14),
      endTime: vnAt(3, 16),
    });

    // Switch roomB -> MAINTENANCE
    const maintRes = await request(app)
      .patch(`/api/v1/admin/rooms/${roomBId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: RoomStatus.MAINTENANCE, acknowledgeFutureBookings: true });
    expect(maintRes.status).toBe(200);

    // Repeat MAINTENANCE -> MAINTENANCE creates 0 extra rows
    const repeatRes = await request(app)
      .patch(`/api/v1/admin/rooms/${roomBId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: RoomStatus.MAINTENANCE, acknowledgeFutureBookings: true });
    expect(repeatRes.status).toBe(200);

    // Switch roomB -> ARCHIVED (same booking gets a second eventKey!)
    const archiveRes = await request(app)
      .patch(`/api/v1/admin/rooms/${roomBId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: RoomStatus.ARCHIVED, acknowledgeFutureBookings: true });
    expect(archiveRes.status).toBe(200);

    const alerts = await prisma.emailOutbox.findMany({
      where: { bookingId: targetBooking.id, kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE },
      orderBy: { createdAt: 'asc' },
    });
    expect(alerts).toHaveLength(2);
    expect(alerts[0].eventKey).toMatch(/^room_status:MAINTENANCE:/);
    expect(alerts[1].eventKey).toMatch(/^room_status:ARCHIVED:/);

    expect(
      await prisma.emailOutbox.count({
        where: { bookingId: guestBooking.id, kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE },
      }),
    ).toBe(0);

    // Booking stays CONFIRMED and UNPAID
    const reloaded = await prisma.booking.findUniqueOrThrow({ where: { id: targetBooking.id } });
    expect(reloaded.status).toBe(BookingStatus.CONFIRMED);
    expect(reloaded.paymentStatus).toBe(PaymentStatus.UNPAID);

    // SMTP failure leaves booking + room intact and parks outbox for retry
    await isolateOutboxTo([targetBooking.id]);
    const failing = buildMockNotifier(false, true);
    const worker = new EmailOutboxService(failing.notifier);
    const retryPass = await worker.processDue(vnAt(3, 8), 50);
    expect(retryPass).toMatchObject({ retried: 1, skipped: 1 });

    const roomRow = await prisma.room.findUniqueOrThrow({ where: { id: roomBId } });
    expect(roomRow.status).toBe(RoomStatus.ARCHIVED);

    // Restore roomB -> AVAILABLE before next retry: queued rows re-validate to SKIPPED BOOKING_NOT_AFFECTED
    const restoreRes = await request(app)
      .patch(`/api/v1/admin/rooms/${roomBId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: RoomStatus.AVAILABLE });
    expect(restoreRes.status).toBe(200);

    const healthy = buildMockNotifier(true, true);
    const healthyWorker = new EmailOutboxService(healthy.notifier);
    const skippedPass = await healthyWorker.processDue(vnAt(3, 9), 50);
    expect(skippedPass.skipped).toBe(1);
    expect(healthy.sendUnavailable).not.toHaveBeenCalled();

    const afterRevalidate = await prisma.emailOutbox.findMany({
      where: { bookingId: targetBooking.id, kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE },
    });
    expect(
      afterRevalidate.every(
        (r) => r.status === 'SKIPPED' && r.lastError === 'BOOKING_NOT_AFFECTED',
      ),
    ).toBe(true);
  });

  it('AC2: skips BOOKING_REMINDER with ROOM_UNAVAILABLE on closure or non-AVAILABLE room (both SMTP on and off)', async () => {
    const closedBooking = await createBookingRecord({
      roomId: roomAId,
      startTime: vnAt(5, 10),
      endTime: vnAt(5, 12),
    });
    const closure = await prisma.closure.create({
      data: {
        roomId: null,
        startTime: vnAt(5, 9),
        endTime: vnAt(5, 11),
        reason: 'Kiểm tra PCCC',
        createdById: customerId,
      },
    });
    createdClosureIds.push(closure.id);

    const maintBooking = await createBookingRecord({
      roomId: roomBId,
      startTime: vnAt(5, 10),
      endTime: vnAt(5, 12),
    });
    await prisma.room.update({ where: { id: roomBId }, data: { status: RoomStatus.MAINTENANCE } });

    await prisma.emailOutbox.createMany({
      data: [
        { kind: EmailOutboxKind.BOOKING_REMINDER, bookingId: closedBooking.id, eventKey: '' },
        { kind: EmailOutboxKind.BOOKING_REMINDER, bookingId: maintBooking.id, eventKey: '' },
      ],
    });
    await isolateOutboxTo([closedBooking.id, maintBooking.id]);

    // First verify even with SMTP disabled, business skip reason ROOM_UNAVAILABLE wins over SMTP_DISABLED
    const smtpOff = buildMockNotifier(true, false);
    const offWorker = new EmailOutboxService(smtpOff.notifier);
    const res1 = await offWorker.processDue(vnAt(5, 8), 50);
    expect(res1.skipped).toBe(2);
    expect(smtpOff.sendReminder).not.toHaveBeenCalled();

    const rows = await prisma.emailOutbox.findMany({
      where: {
        bookingId: { in: [closedBooking.id, maintBooking.id] },
        kind: EmailOutboxKind.BOOKING_REMINDER,
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'SKIPPED' && r.lastError === 'ROOM_UNAVAILABLE')).toBe(
      true,
    );

    // Also test ARCHIVED + SMTP enabled
    await prisma.room.update({ where: { id: roomBId }, data: { status: RoomStatus.ARCHIVED } });
    await prisma.emailOutbox.updateMany({
      where: { bookingId: maintBooking.id, kind: EmailOutboxKind.BOOKING_REMINDER },
      data: { status: 'QUEUED', attempts: 0, nextAttemptAt: vnAt(5, 8), lastError: null },
    });
    const smtpOn = buildMockNotifier(true, true);
    const onWorker = new EmailOutboxService(smtpOn.notifier);
    const res2 = await onWorker.processDue(vnAt(5, 8), 50);
    expect(res2.skipped).toBe(1);
    expect(smtpOn.sendReminder).not.toHaveBeenCalled();

    // Clean roomB back to AVAILABLE for subsequent test
    await prisma.room.update({ where: { id: roomBId }, data: { status: RoomStatus.AVAILABLE } });
  });

  it('AC3 & AC4: returns roomUnavailable* in customer/admin endpoints, supports needsAttention=true filter, and clears on room reschedule', async () => {
    const targetVnDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(Date.now() + 3 * 24 * HOUR),
    );
    const start10 = new Date(`${targetVnDate}T10:00:00.000+07:00`);
    const end12 = new Date(`${targetVnDate}T12:00:00.000+07:00`);
    const touchEnd14 = new Date(`${targetVnDate}T14:00:00.000+07:00`);

    const affectedClosure = await createBookingRecord({
      roomId: roomAId,
      startTime: start10,
      endTime: end12,
    });
    const unaffectedTouch = await createBookingRecord({
      roomId: roomAId,
      startTime: end12,
      endTime: touchEnd14,
    });
    const cancelledInClosure = await createBookingRecord({
      roomId: roomAId,
      startTime: start10,
      endTime: end12,
      status: BookingStatus.CANCELLED,
    });
    const maintAffected = await createBookingRecord({
      roomId: roomBId,
      startTime: start10,
      endTime: end12,
    });

    const closure = await prisma.closure.create({
      data: {
        roomId: roomAId,
        startTime: start10,
        endTime: end12,
        reason: 'Sơn lại phòng A',
        createdById: customerId,
      },
    });
    createdClosureIds.push(closure.id);
    await prisma.room.update({ where: { id: roomBId }, data: { status: RoomStatus.MAINTENANCE } });

    // Customer GET /api/v1/bookings/:id
    const detailRes = await request(app)
      .get(`/api/v1/bookings/${affectedClosure.id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data).toMatchObject({
      roomUnavailable: true,
      roomUnavailableCause: 'CLOSURE',
      roomUnavailableReason: 'Sơn lại phòng A',
    });

    const normalDetailRes = await request(app)
      .get(`/api/v1/bookings/${unaffectedTouch.id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(normalDetailRes.status).toBe(200);
    expect(normalDetailRes.body.data).toMatchObject({
      roomUnavailable: false,
      roomUnavailableCause: null,
      roomUnavailableReason: null,
    });

    // Customer GET /api/v1/bookings
    const listRes = await request(app)
      .get('/api/v1/bookings?page=1&limit=50')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(listRes.status).toBe(200);
    const items = listRes.body.data.items as Array<{
      id: string;
      roomUnavailable: boolean;
      roomUnavailableCause: string | null;
      roomUnavailableReason: string | null;
    }>;
    expect(items.find((i) => i.id === affectedClosure.id)).toMatchObject({
      roomUnavailable: true,
      roomUnavailableCause: 'CLOSURE',
      roomUnavailableReason: 'Sơn lại phòng A',
    });
    expect(items.find((i) => i.id === cancelledInClosure.id)).toMatchObject({
      roomUnavailable: false,
      roomUnavailableCause: null,
      roomUnavailableReason: null,
    });

    // Admin GET /api/v1/admin/bookings?needsAttention=true&date=...
    const dateVn = targetVnDate;
    const adminAttentionRes = await request(app)
      .get(`/api/v1/admin/bookings?needsAttention=true&date=${dateVn}&limit=50`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminAttentionRes.status).toBe(200);
    const adminItems = adminAttentionRes.body.data.items as Array<{
      id: string;
      roomUnavailable: boolean;
      roomUnavailableCause: string | null;
      roomUnavailableReason: string | null;
    }>;
    const attentionIds = adminItems.map((b) => b.id);
    expect(attentionIds).toContain(affectedClosure.id);
    expect(attentionIds).toContain(maintAffected.id);
    expect(attentionIds).not.toContain(unaffectedTouch.id);
    expect(attentionIds).not.toContain(cancelledInClosure.id);

    expect(adminItems.find((b) => b.id === maintAffected.id)).toMatchObject({
      roomUnavailable: true,
      roomUnavailableCause: 'ROOM_MAINTENANCE',
      roomUnavailableReason: 'Phòng đang bảo trì',
    });

    // Restore roomB -> AVAILABLE so customer can reschedule affectedClosure onto a free slot on roomB
    await prisma.room.update({ where: { id: roomBId }, data: { status: RoomStatus.AVAILABLE } });
    const rescheduleRes = await request(app)
      .patch(`/api/v1/bookings/${affectedClosure.id}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        roomId: roomBId,
        startTime: end12.toISOString(),
        endTime: touchEnd14.toISOString(),
      });
    expect(rescheduleRes.status).toBe(200);
    expect(rescheduleRes.body.data.room.id).toBe(roomBId);
    expect(rescheduleRes.body.data.roomUnavailable).toBe(false);
  });

  it('R01: excludes ended checked-in CONFIRMED bookings from roomUnavailable, needsAttention=true, closure enqueue, and outbox delivery', async () => {
    const pastStart = new Date(Date.now() - 4 * HOUR);
    const pastEnd = new Date(Date.now() - 2 * HOUR);

    const pastCheckedIn = await createBookingRecord({
      roomId: roomAId,
      startTime: pastStart,
      endTime: pastEnd,
      checkedInAt: pastStart,
      status: BookingStatus.CONFIRMED,
    });

    const pastClosureRes = await request(app)
      .post('/api/v1/admin/closures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: roomAId,
        startTime: pastStart.toISOString(),
        endTime: pastEnd.toISOString(),
        reason: 'Sửa chữa sau khi khách check-in kết thúc',
        acknowledgeConflictingBookings: true,
      });
    expect(pastClosureRes.status).toBe(201);
    const pastClosureId = pastClosureRes.body.data.id as string;
    createdClosureIds.push(pastClosureId);

    // Closure creation must not enqueue BOOKING_ROOM_UNAVAILABLE for already-ended bookings
    const closureOutbox = await prisma.emailOutbox.findMany({
      where: {
        bookingId: pastCheckedIn.id,
        kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE,
        eventKey: `closure:${pastClosureId}`,
      },
    });
    expect(closureOutbox).toHaveLength(0);

    try {
      await prisma.room.update({
        where: { id: roomAId },
        data: { status: RoomStatus.MAINTENANCE },
      });

      const detailRes = await request(app)
        .get(`/api/v1/bookings/${pastCheckedIn.id}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data).toMatchObject({
        roomUnavailable: false,
        roomUnavailableCause: null,
        roomUnavailableReason: null,
      });

      const listRes = await request(app)
        .get('/api/v1/bookings?page=1&limit=50')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(listRes.status).toBe(200);
      const foundInList = (listRes.body.data.items as Array<{ id: string }>).find(
        (b) => b.id === pastCheckedIn.id,
      );
      expect(foundInList).toMatchObject({
        roomUnavailable: false,
        roomUnavailableCause: null,
        roomUnavailableReason: null,
      });

      const attnTrue = await request(app)
        .get(`/api/v1/admin/bookings?needsAttention=true&bookingCode=${pastCheckedIn.bookingCode}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(attnTrue.status).toBe(200);
      expect(attnTrue.body.data.items).toHaveLength(0);

      const attnFalse = await request(app)
        .get(`/api/v1/admin/bookings?needsAttention=false&bookingCode=${pastCheckedIn.bookingCode}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(attnFalse.status).toBe(200);
      expect(attnFalse.body.data.items).toHaveLength(1);
      expect(attnFalse.body.data.items[0].roomUnavailable).toBe(false);

      // Even if a room-status outbox row existed, processDue after endTime skips as BOOKING_NOT_ACTIVE
      const queuedRow = await prisma.emailOutbox.create({
        data: {
          kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE,
          bookingId: pastCheckedIn.id,
          eventKey: `room_status:MAINTENANCE:${new Date().toISOString()}`,
          nextAttemptAt: new Date(Date.now() - 10_000),
        },
      });
      await isolateOutboxTo([pastCheckedIn.id]);
      const { notifier, sendUnavailable } = buildMockNotifier(true, true);
      const worker = new EmailOutboxService(notifier);
      const proc = await worker.processDue(new Date(), 50);
      expect(proc.skipped).toBeGreaterThanOrEqual(1);
      expect(sendUnavailable).not.toHaveBeenCalled();

      const afterProc = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: queuedRow.id } });
      expect(afterProc.status).toBe('SKIPPED');
      expect(afterProc.lastError).toBe('BOOKING_NOT_ACTIVE');
    } finally {
      await prisma.room.update({ where: { id: roomAId }, data: { status: RoomStatus.AVAILABLE } });
    }
  });

  it('R02: sends ROOM_MAINTENANCE for room_status:* despite overlapping Closure, and skips BOOKING_NOT_AFFECTED when restored to AVAILABLE', async () => {
    const start = vnAt(7, 10);
    const end = vnAt(7, 12);
    const booking = await createBookingRecord({ roomId: roomBId, startTime: start, endTime: end });

    const closureRes = await request(app)
      .post('/api/v1/admin/closures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: roomBId,
        startTime: vnAt(7, 9).toISOString(),
        endTime: vnAt(7, 13).toISOString(),
        reason: 'Sửa điều hòa tầng 3',
        acknowledgeConflictingBookings: true,
      });
    expect(closureRes.status).toBe(201);
    const closureId = closureRes.body.data.id as string;
    createdClosureIds.push(closureId);

    // Deliver closure alert first
    await isolateOutboxTo([booking.id]);
    const worker1 = new EmailOutboxService(buildMockNotifier(true, true).notifier);
    expect((await worker1.processDue(vnAt(7, 7), 50)).sent).toBe(1);

    try {
      // Transition roomB -> MAINTENANCE while Closure still overlaps
      const maintRes = await request(app)
        .patch(`/api/v1/admin/rooms/${roomBId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.MAINTENANCE, acknowledgeFutureBookings: true });
      expect(maintRes.status).toBe(200);

      await isolateOutboxTo([booking.id]);
      const mock2 = buildMockNotifier(true, true);
      const worker2 = new EmailOutboxService(mock2.notifier);
      const res2 = await worker2.processDue(vnAt(7, 8), 50);
      expect(res2.sent).toBe(1);
      expect(mock2.sendUnavailable).toHaveBeenCalledTimes(1);
      expect(mock2.sendUnavailable).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingCode: booking.bookingCode,
          cause: 'ROOM_MAINTENANCE',
          reason: 'Phòng đang bảo trì',
        }),
      );

      // Step MAINTENANCE -> ARCHIVED then immediately back -> AVAILABLE before worker ticks
      await request(app)
        .patch(`/api/v1/admin/rooms/${roomBId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.ARCHIVED, acknowledgeFutureBookings: true })
        .expect(200);
      await request(app)
        .patch(`/api/v1/admin/rooms/${roomBId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.AVAILABLE })
        .expect(200);

      await isolateOutboxTo([booking.id]);
      const mock3 = buildMockNotifier(true, true);
      const worker3 = new EmailOutboxService(mock3.notifier);
      const res3 = await worker3.processDue(vnAt(7, 8), 50);
      expect(res3.skipped).toBe(1);
      expect(res3.sent).toBe(0);
      expect(mock3.sendUnavailable).not.toHaveBeenCalled();

      const archivedRow = await prisma.emailOutbox.findFirstOrThrow({
        where: {
          bookingId: booking.id,
          kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE,
          eventKey: { startsWith: 'room_status:ARCHIVED:' },
        },
      });
      expect(archivedRow.status).toBe('SKIPPED');
      expect(archivedRow.lastError).toBe('BOOKING_NOT_AFFECTED');
    } finally {
      await prisma.room.update({ where: { id: roomBId }, data: { status: RoomStatus.AVAILABLE } });
    }
  });

  it('R03: requeues closure:<id> email when customer reschedules away and admin expands closure, or closure moves back, without duplicating unaffected bookings', async () => {
    const vnDateExp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(Date.now() + 6 * 24 * HOUR),
    );
    const slot = (h: number) =>
      new Date(`${vnDateExp}T${String(h).padStart(2, '0')}:00:00.000+07:00`);

    const stayingBooking = await createBookingRecord({
      roomId: roomAId,
      startTime: slot(8),
      endTime: slot(10),
    });
    const rescheduledBooking = await createBookingRecord({
      roomId: roomAId,
      startTime: slot(10),
      endTime: slot(12),
    });

    // Step 1: Closure covers 08:00-12:00 -> both bookings notified & delivered (SENT)
    const createRes = await request(app)
      .post('/api/v1/admin/closures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: roomAId,
        startTime: slot(8).toISOString(),
        endTime: slot(12).toISOString(),
        reason: 'Bảo trì điện sáng',
        acknowledgeConflictingBookings: true,
      });
    expect(createRes.status).toBe(201);
    const closureId = createRes.body.data.id as string;
    createdClosureIds.push(closureId);

    await isolateOutboxTo([stayingBooking.id, rescheduledBooking.id]);
    const worker1 = new EmailOutboxService(buildMockNotifier(true, true).notifier);
    expect((await worker1.processDue(slot(6), 50)).sent).toBe(2);

    // Step 2: Customer reschedules rescheduledBooking to 15:00-17:00 (safe from 08:00-12:00)
    await request(app)
      .patch(`/api/v1/bookings/${rescheduledBooking.id}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        startTime: slot(15).toISOString(),
        endTime: slot(17).toISOString(),
      })
      .expect(200);

    // Step 3: Admin expands closure to 08:00-18:00 -> rescheduledBooking gets requeued, stayingBooking stays SENT
    await request(app)
      .patch(`/api/v1/admin/closures/${closureId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        endTime: slot(18).toISOString(),
        acknowledgeConflictingBookings: true,
      })
      .expect(200);

    const rowStaying = await prisma.emailOutbox.findUniqueOrThrow({
      where: {
        kind_bookingId_eventKey: {
          kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE,
          bookingId: stayingBooking.id,
          eventKey: `closure:${closureId}`,
        },
      },
    });
    const rowRescheduled = await prisma.emailOutbox.findUniqueOrThrow({
      where: {
        kind_bookingId_eventKey: {
          kind: EmailOutboxKind.BOOKING_ROOM_UNAVAILABLE,
          bookingId: rescheduledBooking.id,
          eventKey: `closure:${closureId}`,
        },
      },
    });
    expect(rowStaying.status).toBe('SENT');
    expect(rowRescheduled.status).toBe('QUEUED');

    await isolateOutboxTo([stayingBooking.id, rescheduledBooking.id]);
    const mock2 = buildMockNotifier(true, true);
    const worker2 = new EmailOutboxService(mock2.notifier);
    const proc2 = await worker2.processDue(slot(6), 50);
    expect(proc2.sent).toBe(2);
    expect(mock2.sendUnavailable).toHaveBeenCalledTimes(1);
    expect(mock2.sendUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ bookingCode: rescheduledBooking.bookingCode }),
    );

    // Step 4: Move closure away -> SKIPPED, then move back -> requeued and delivered
    const moveBooking = await createBookingRecord({
      roomId: roomBId,
      startTime: vnAt(9, 10),
      endTime: vnAt(9, 12),
    });
    const closure2Res = await request(app)
      .post('/api/v1/admin/closures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: roomBId,
        startTime: vnAt(9, 10).toISOString(),
        endTime: vnAt(9, 12).toISOString(),
        reason: 'Sơn trần phòng B',
        acknowledgeConflictingBookings: true,
      })
      .expect(201);
    const closure2Id = closure2Res.body.data.id as string;
    createdClosureIds.push(closure2Id);

    // Move away before worker runs -> SKIPPED BOOKING_NOT_AFFECTED
    await request(app)
      .patch(`/api/v1/admin/closures/${closure2Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startTime: vnAt(9, 14).toISOString(),
        endTime: vnAt(9, 16).toISOString(),
        acknowledgeConflictingBookings: true,
      })
      .expect(200);

    await isolateOutboxTo([moveBooking.id]);
    const workerSkip = new EmailOutboxService(buildMockNotifier(true, true).notifier);
    expect((await workerSkip.processDue(vnAt(9, 8), 50)).skipped).toBe(1);

    // Move back onto moveBooking -> requeued and sent
    await request(app)
      .patch(`/api/v1/admin/closures/${closure2Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startTime: vnAt(9, 10).toISOString(),
        endTime: vnAt(9, 12).toISOString(),
        acknowledgeConflictingBookings: true,
      })
      .expect(200);

    await isolateOutboxTo([moveBooking.id]);
    const mockMoveBack = buildMockNotifier(true, true);
    const workerBack = new EmailOutboxService(mockMoveBack.notifier);
    const resBack = await workerBack.processDue(vnAt(9, 8), 50);
    expect(resBack.sent).toBe(1);
    expect(mockMoveBack.sendUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ bookingCode: moveBooking.bookingCode }),
    );
  });

  it('R05, R08 & R11: preserves paymentInstructions on reschedule, returns roomUnavailable* on idempotency replay, validates filters, and runs enqueueDueReminders -> ROOM_UNAVAILABLE', async () => {
    const vnDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(Date.now() + 8 * 24 * HOUR),
    );
    const slotStart = new Date(`${vnDate}T09:00:00.000+07:00`);
    const slotEnd = new Date(`${vnDate}T11:00:00.000+07:00`);
    const newStart = new Date(`${vnDate}T13:00:00.000+07:00`);
    const newEnd = new Date(`${vnDate}T15:00:00.000+07:00`);

    const replayUser = await prisma.user.create({
      data: {
        email: `cwb91_replay_${tag}@example.com`,
        passwordHash: '!integration-test-account',
        fullName: 'Khách Replay CWB91',
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
      },
    });
    const replayToken = accounts.token(Role.CUSTOMER, replayUser.id);
    const originalPayment = ENV.PAYMENT;

    try {
      ENV.PAYMENT = {
        bankName: 'Vietcombank',
        accountNumber: '0123456789',
        accountName: 'CONG TY CO SPACE',
      };
      // Create booking via HTTP with Idempotency-Key
      const idempKey = `cwb91-replay-${tag}`;
      const createPayload = {
        roomId: roomAId,
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
      };
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${replayToken}`)
        .set('Idempotency-Key', idempKey)
        .send(createPayload)
        .expect(201);
      const createdId = createRes.body.data.id as string;
      expect(createRes.body.data.roomUnavailable).toBe(false);

      // Create closure overlapping the newly booked slot, then replay POST /bookings with same Idempotency-Key
      const replayClosure = await request(app)
        .post('/api/v1/admin/closures')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: roomAId,
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          reason: 'Đóng cửa sau khi đặt',
          acknowledgeConflictingBookings: true,
        })
        .expect(201);
      createdClosureIds.push(replayClosure.body.data.id as string);

      const replayRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${replayToken}`)
        .set('Idempotency-Key', idempKey)
        .send(createPayload)
        .expect(200);
      expect(replayRes.body.data).toMatchObject({
        id: createdId,
        roomUnavailable: true,
        roomUnavailableCause: 'CLOSURE',
        roomUnavailableReason: 'Đóng cửa sau khi đặt',
      });

      // R05: Reschedule UNPAID booking onto roomB (150k/h x 2h = 300000.00) returns paymentInstructions
      const reschedRes = await request(app)
        .patch(`/api/v1/bookings/${createdId}`)
        .set('Authorization', `Bearer ${replayToken}`)
        .send({
          roomId: roomBId,
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
        })
        .expect(200);
      expect(reschedRes.body.data.totalAmount).toBe('300000.00');
      expect(reschedRes.body.data.paymentInstructions).toMatchObject({
        transferContent: reschedRes.body.data.bookingCode,
        amount: '300000.00',
      });
    } finally {
      ENV.PAYMENT = originalPayment;
      await prisma.booking.deleteMany({ where: { userId: replayUser.id } });
      await prisma.user.deleteMany({ where: { id: replayUser.id } });
    }

    // R08 & R11: Admin outbox filter by kind=BOOKING_ROOM_UNAVAILABLE hides eventKey; rejects invalid filters
    const outboxListRes = await request(app)
      .get('/api/v1/admin/email-outbox?kind=BOOKING_ROOM_UNAVAILABLE&limit=20')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(outboxListRes.body.data.items.length).toBeGreaterThanOrEqual(1);
    for (const item of outboxListRes.body.data.items as Array<Record<string, unknown>>) {
      expect(item.kind).toBe('BOOKING_ROOM_UNAVAILABLE');
      expect('eventKey' in item).toBe(false);
    }

    await request(app)
      .get('/api/v1/admin/email-outbox?kind=INVALID_KIND')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const badAttnRes = await request(app)
      .get('/api/v1/admin/bookings?needsAttention=invalid')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    expect(badAttnRes.body.code).toBe('VALIDATION_ERROR');

    // R08 (AC2 real enqueueDueReminders -> processDue): booking inside reminder window whose room turns MAINTENANCE
    const remStart = vnAt(11, 10);
    const remNow = new Date(remStart.getTime() - 90 * 60_000); // 1h30m before start (inside 2h window)
    const remBooking = await createBookingRecord({
      roomId: roomAId,
      startTime: remStart,
      endTime: vnAt(11, 12),
      createdAt: new Date(remStart.getTime() - 24 * HOUR),
    });

    try {
      await prisma.room.update({
        where: { id: roomAId },
        data: { status: RoomStatus.MAINTENANCE },
      });
      const { notifier, sendReminder } = buildMockNotifier(true, true);
      const worker = new EmailOutboxService(notifier);
      const queuedCount = await worker.enqueueDueReminders(remNow, 2);
      expect(queuedCount).toBeGreaterThanOrEqual(1);

      await isolateOutboxTo([remBooking.id]);
      const remProc = await worker.processDue(remNow, 50);
      expect(remProc.skipped).toBeGreaterThanOrEqual(1);
      expect(sendReminder).not.toHaveBeenCalled();

      const remRow = await prisma.emailOutbox.findUniqueOrThrow({
        where: {
          kind_bookingId_eventKey: {
            kind: EmailOutboxKind.BOOKING_REMINDER,
            bookingId: remBooking.id,
            eventKey: '',
          },
        },
      });
      expect(remRow.status).toBe('SKIPPED');
      expect(remRow.lastError).toBe('ROOM_UNAVAILABLE');
    } finally {
      await prisma.room.update({ where: { id: roomAId }, data: { status: RoomStatus.AVAILABLE } });
    }
  });
});
