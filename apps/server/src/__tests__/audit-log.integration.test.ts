import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, PaymentStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';

describe('CWB-67 audit log for admin mutations (real MySQL)', () => {
  const prefix = `test_audit_${randomUUID().slice(0, 8)}`;
  let adminId: string;
  let adminToken: string;
  let customerId: string;
  let customerToken: string;
  let roomId: string;
  const bookingIds: string[] = [];
  const roomIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function seedBooking(overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
    const start = new Date(Date.now() + 96 * 3_600_000);
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `CS-20261103-${randomUUID().slice(0, 4).toUpperCase()}`,
        roomId,
        userId: customerId,
        startTime: start,
        endTime: new Date(start.getTime() + 2 * 3_600_000),
        totalAmount: new Prisma.Decimal('400.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        ...overrides,
      },
    });
    bookingIds.push(booking.id);
    return booking;
  }

  const eventsFor = (entityId: string) =>
    prisma.auditEvent.findMany({ where: { entityId }, orderBy: { sequence: 'asc' } });

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `${prefix}_admin@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Admin Audit',
        role: Role.ADMIN,
      },
    });
    adminId = admin.id;
    adminToken = generateToken({ sub: adminId, role: Role.ADMIN });
    const customer = await prisma.user.create({
      data: {
        email: `${prefix}_customer@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Khách Audit',
        role: Role.CUSTOMER,
      },
    });
    customerId = customer.id;
    customerToken = generateToken({ sub: customerId, role: Role.CUSTOMER });
    const room = await prisma.room.create({
      data: {
        name: `${prefix}_room`,
        capacity: 6,
        pricePerHour: new Prisma.Decimal('200.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    roomId = room.id;
    roomIds.push(room.id);
  });

  afterAll(async () => {
    const guestBookings = await prisma.booking.findMany({
      where: { roomId: { in: roomIds } },
      select: { id: true },
    });
    const ids = [...new Set([...bookingIds, ...guestBookings.map((b) => b.id), ...roomIds])];
    await prisma.auditEvent.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.roomStatusHistory.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, customerId] } } });
    await prisma.$disconnect();
  });

  it('records payment confirmation with actor, before and after, once per real change', async () => {
    const booking = await seedBooking();
    const path = `/api/v1/admin/bookings/${booking.id}/payment`;
    const first = await request(app)
      .patch(path)
      .set(auth(adminToken))
      .send({ paymentMethod: 'CASH' });
    expect(first.status).toBe(200);
    const retry = await request(app)
      .patch(path)
      .set(auth(adminToken))
      .send({ paymentMethod: 'CASH' });
    expect(retry.status).toBe(200);

    const events = await eventsFor(booking.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: adminId,
      actorRole: Role.ADMIN,
      action: 'BOOKING_PAYMENT_CONFIRMED',
      entityType: 'BOOKING',
      before: expect.objectContaining({ paymentStatus: 'UNPAID', paymentMethod: null }),
      after: expect.objectContaining({ paymentStatus: 'PAID', paymentMethod: 'CASH' }),
    });
  });

  it('records a single event when concurrent payment confirmations race', async () => {
    const booking = await seedBooking();
    const path = `/api/v1/admin/bookings/${booking.id}/payment`;
    const results = await Promise.all(
      [0, 1, 2].map(() =>
        request(app).patch(path).set(auth(adminToken)).send({ paymentMethod: 'QR' }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await eventsFor(booking.id)).toHaveLength(1);
  });

  it('records admin cancellation with the reason and does not duplicate on retry', async () => {
    const booking = await seedBooking();
    const path = `/api/v1/admin/bookings/${booking.id}/cancel`;
    expect(
      (await request(app).patch(path).set(auth(adminToken)).send({ reason: 'Phòng hỏng điều hòa' }))
        .status,
    ).toBe(200);
    expect(
      (await request(app).patch(path).set(auth(adminToken)).send({ reason: 'Lần nữa' })).status,
    ).toBe(200);

    const events = await eventsFor(booking.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'BOOKING_CANCELLED_BY_ADMIN',
      before: expect.objectContaining({ status: 'CONFIRMED', cancellationReason: null }),
      after: expect.objectContaining({
        status: 'CANCELLED',
        cancellationReason: 'Phòng hỏng điều hòa',
      }),
    });
  });

  it('records check-in, completion and no-show transitions', async () => {
    const now = Date.now();
    const live = await seedBooking({
      startTime: new Date(now - 60_000),
      endTime: new Date(now + 3_600_000),
    });
    expect(
      (await request(app).patch(`/api/v1/admin/bookings/${live.id}/check-in`).set(auth(adminToken)))
        .status,
    ).toBe(200);

    const ended = await seedBooking({
      startTime: new Date(now - 4 * 3_600_000),
      endTime: new Date(now - 2 * 3_600_000),
      checkedInAt: new Date(now - 4 * 3_600_000),
    });
    expect(
      (
        await request(app)
          .patch(`/api/v1/admin/bookings/${ended.id}/complete`)
          .set(auth(adminToken))
      ).status,
    ).toBe(200);

    const missed = await seedBooking({
      startTime: new Date(now - 4 * 3_600_000),
      endTime: new Date(now - 2 * 3_600_000),
    });
    expect(
      (
        await request(app)
          .patch(`/api/v1/admin/bookings/${missed.id}/no-show`)
          .set(auth(adminToken))
      ).status,
    ).toBe(200);

    expect((await eventsFor(live.id)).map((e) => e.action)).toEqual(['BOOKING_CHECKED_IN']);
    expect((await eventsFor(ended.id))[0]).toMatchObject({
      action: 'BOOKING_COMPLETED',
      before: expect.objectContaining({ status: 'CONFIRMED' }),
      after: expect.objectContaining({ status: 'COMPLETED' }),
    });
    expect((await eventsFor(missed.id))[0]).toMatchObject({
      action: 'BOOKING_MARKED_NO_SHOW',
      after: expect.objectContaining({ status: 'NO_SHOW' }),
    });
  });

  it('writes no event when the mutation is rejected with 409', async () => {
    const booking = await seedBooking({
      status: BookingStatus.CANCELLED,
      cancellationReason: 'Khách bận',
    });
    const res = await request(app)
      .patch(`/api/v1/admin/bookings/${booking.id}/complete`)
      .set(auth(adminToken));
    expect(res.status).toBe(409);
    expect(await eventsFor(booking.id)).toHaveLength(0);
  });

  it('records guest booking creation without guest PII', async () => {
    const start = new Date(Date.now() + 120 * 3_600_000);
    start.setUTCHours(3, 0, 0, 0);
    const res = await request(app)
      .post('/api/v1/admin/bookings/guest')
      .set(auth(adminToken))
      .send({
        roomId,
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + 3_600_000).toISOString(),
        guestName: 'Khách Vãng Lai Audit',
        guestPhone: '0987654321',
      });
    expect(res.status).toBe(201);

    const events = await eventsFor(res.body.data.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: adminId,
      action: 'BOOKING_GUEST_CREATED',
      before: null,
      after: expect.objectContaining({
        bookingCode: res.body.data.bookingCode,
        roomId,
        totalAmount: '200.00',
      }),
    });
    const json = JSON.stringify(events[0]);
    expect(json).not.toContain('0987654321');
    expect(json).not.toContain('Khách Vãng Lai Audit');
  });

  it('records room status changes but not unrelated room edits', async () => {
    const room = await prisma.room.create({
      data: {
        name: `${prefix}_status_room`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    roomIds.push(room.id);
    const path = `/api/v1/admin/rooms/${room.id}`;

    expect(
      (await request(app).patch(path).set(auth(adminToken)).send({ capacity: 5 })).status,
    ).toBe(200);
    expect(
      (await request(app).patch(path).set(auth(adminToken)).send({ status: 'MAINTENANCE' })).status,
    ).toBe(200);
    expect(
      (await request(app).patch(path).set(auth(adminToken)).send({ status: 'MAINTENANCE' })).status,
    ).toBe(200);

    const events = await eventsFor(room.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'ROOM_STATUS_CHANGED',
      entityType: 'ROOM',
      before: { status: 'AVAILABLE' },
      after: { status: 'MAINTENANCE', acknowledgeFutureBookings: false },
    });
  });

  describe('GET /api/v1/admin/audit-events', () => {
    it('returns 401 without a token and 403 for a customer', async () => {
      expect((await request(app).get('/api/v1/admin/audit-events')).status).toBe(401);
      expect(
        (await request(app).get('/api/v1/admin/audit-events').set(auth(customerToken))).status,
      ).toBe(403);
    });

    it('filters by entity, paginates newest first and rejects unknown query fields', async () => {
      const booking = await seedBooking();
      await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/payment`)
        .set(auth(adminToken))
        .send({ paymentMethod: 'CASH' });
      await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/cancel`)
        .set(auth(adminToken))
        .send({ reason: 'Đổi lịch' });

      const res = await request(app)
        .get('/api/v1/admin/audit-events')
        .query({ entityType: 'BOOKING', entityId: booking.id, limit: 1 })
        .set(auth(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({
        action: 'BOOKING_CANCELLED_BY_ADMIN',
        actorId: adminId,
        entityId: booking.id,
      });

      const byAction = await request(app)
        .get('/api/v1/admin/audit-events')
        .query({ entityId: booking.id, action: 'BOOKING_PAYMENT_CONFIRMED' })
        .set(auth(adminToken));
      expect(byAction.body.data.items.map((e: { action: string }) => e.action)).toEqual([
        'BOOKING_PAYMENT_CONFIRMED',
      ]);

      for (const query of [{ limit: 101 }, { action: 'DROP' }, { sort: 'actorId' }]) {
        const bad = await request(app)
          .get('/api/v1/admin/audit-events')
          .query(query)
          .set(auth(adminToken));
        expect(bad.status).toBe(400);
      }
    });
  });
});
