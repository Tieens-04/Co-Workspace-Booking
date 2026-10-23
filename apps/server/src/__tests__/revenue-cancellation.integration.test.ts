import { randomInt, randomUUID } from 'node:crypto';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  RoomStatus,
} from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app.js';
import { notificationService } from '../services/notification.service.js';
import { generateToken } from '../utils/jwt.util.js';
import prisma from '../utils/prisma.util.js';
import { getDayBounds } from '../utils/room-availability.util.js';

describe('Cancellation revenue integration (real MySQL)', () => {
  const prefix = `test_revenue_cancel_${randomUUID()}`;
  const adminToken = generateToken({ sub: randomUUID(), role: Role.ADMIN });
  let userId: string | undefined;
  let roomId: string | undefined;
  let customerToken: string;
  let date: string;
  let startTime: Date;

  beforeAll(async () => {
    // SMTP is outside this test; persistence, HTTP handlers and locking remain real.
    vi.spyOn(notificationService, 'sendBookingCancellation').mockResolvedValue(true);
    const user = await prisma.user.create({
      data: {
        email: `${prefix}@example.com`,
        fullName: 'Revenue cancellation customer',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        role: Role.CUSTOMER,
      },
    });
    userId = user.id;
    customerToken = generateToken({ sub: user.id, role: Role.CUSTOMER });
    const createdAt = new Date();
    const room = await prisma.room.create({
      data: {
        name: prefix,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100.00'),
        status: RoomStatus.AVAILABLE,
        createdAt,
        statusHistory: { create: { status: RoomStatus.AVAILABLE, effectiveAt: createdAt } },
      },
    });
    roomId = room.id;
  });

  beforeEach(async () => {
    // KPI has no room filter. Choose an empty future day across ALL rooms so
    // both APIs select exactly the fixture, without deleting other test data.
    const candidate = new Date(Date.now() + randomInt(366, 3650) * 86400000);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      date = candidate.toISOString().slice(0, 10);
      const { dayStart, dayEnd } = getDayBounds(date);
      const count = await prisma.booking.count({
        where: { startTime: { lt: dayEnd }, endTime: { gt: dayStart } },
      });
      if (count === 0) {
        startTime = new Date(`${date}T10:00:00+07:00`);
        return;
      }
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    throw new Error('Could not find an isolated future day for revenue integration fixtures');
  });

  afterAll(async () => {
    try {
      // Explicit guards prevent undefined IDs from broadening a cleanup query
      // when fixture setup fails partway through.
      if (roomId) {
        await prisma.booking.deleteMany({ where: { roomId } });
        await prisma.room.deleteMany({ where: { id: roomId } });
      }
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    } finally {
      vi.restoreAllMocks();
      await prisma.$disconnect();
    }
  });

  function createBooking(paymentStatus: PaymentStatus) {
    if (!roomId || !userId) throw new Error('Revenue test fixtures are not initialized');
    return prisma.booking.create({
      data: {
        bookingCode: `CS-${date.replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
        roomId,
        userId,
        startTime,
        endTime: new Date(startTime.getTime() + 3600000),
        totalAmount: new Prisma.Decimal('100.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus,
        paymentMethod: paymentStatus === PaymentStatus.PAID ? PaymentMethod.CASH : null,
      },
    });
  }

  function cancel(id: string, actor: 'admin' | 'customer') {
    const path = actor === 'admin' ? '/api/v1/admin/bookings' : '/api/v1/bookings';
    const operation = request(app)
      .patch(`${path}/${id}/cancel`)
      .set('Authorization', `Bearer ${actor === 'admin' ? adminToken : customerToken}`);
    return actor === 'admin'
      ? operation.send({ reason: 'Revenue cancellation regression' })
      : operation;
  }

  function pay(id: string) {
    return request(app)
      .patch(`/api/v1/admin/bookings/${id}/payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentMethod: PaymentMethod.CASH });
  }

  async function expectRevenue(paymentStatus: PaymentStatus, cancelled: boolean) {
    const [revenue, kpi] = await Promise.all([
      request(app)
        .get('/api/v1/admin/revenue')
        .query({ startDate: date, endDate: date, roomId })
        .set('Authorization', `Bearer ${adminToken}`),
      request(app)
        .get('/api/v1/admin/dashboard/kpi')
        .query({ date, period: 'day' })
        .set('Authorization', `Bearer ${adminToken}`),
    ]);
    expect(revenue.status).toBe(200);
    expect(kpi.status).toBe(200);
    const paid = paymentStatus === PaymentStatus.PAID;
    const unpaid = !paid && !cancelled;
    const amounts = {
      actualRevenue: paid ? '100.00' : '0.00',
      unpaidRevenue: unpaid ? '100.00' : '0.00',
      potentialRevenue: paid || unpaid ? '100.00' : '0.00',
    };
    expect(revenue.body.data).toMatchObject({
      ...amounts,
      totalBookings: 1,
      paidBookings: paid ? 1 : 0,
      unpaidBookings: unpaid ? 1 : 0,
      cancelledBookings: cancelled ? 1 : 0,
    });
    expect(kpi.body.data).toMatchObject({
      ...amounts,
      periodBookingsCount: 1,
      paidBookingsCount: paid ? 1 : 0,
      unpaidBookingsCount: unpaid ? 1 : 0,
      bookedMinutes: cancelled ? 0 : 60,
      statusBreakdown: { cancelled: cancelled ? 1 : 0, confirmed: cancelled ? 0 : 1 },
    });
  }

  it.each(['admin', 'customer'] as const)(
    '%s cancellation preserves PAID money and payment fields',
    async (actor) => {
      const booking = await createBooking(PaymentStatus.PAID);
      await expectRevenue(PaymentStatus.PAID, false);
      const response = await cancel(booking.id, actor);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.CASH,
        totalAmount: '100.00',
      });
      const persisted = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(persisted.status).toBe(BookingStatus.CANCELLED);
      expect(persisted.paymentStatus).toBe(PaymentStatus.PAID);
      expect(persisted.paymentMethod).toBe(PaymentMethod.CASH);
      expect(persisted.totalAmount.toFixed(2)).toBe('100.00');
      await expectRevenue(PaymentStatus.PAID, true);
    },
  );

  it.each(['admin', 'customer'] as const)(
    '%s cancellation removes UNPAID money from potential revenue',
    async (actor) => {
      const booking = await createBooking(PaymentStatus.UNPAID);
      await expectRevenue(PaymentStatus.UNPAID, false);
      expect((await cancel(booking.id, actor)).status).toBe(200);
      await expectRevenue(PaymentStatus.UNPAID, true);
    },
  );

  it.each(['admin', 'customer'] as const)(
    '%s concurrent and repeated cancellation counts PAID revenue once',
    async (actor) => {
      const booking = await createBooking(PaymentStatus.PAID);
      const responses = await Promise.all([cancel(booking.id, actor), cancel(booking.id, actor)]);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect((await cancel(booking.id, actor)).status).toBe(200);
      await expectRevenue(PaymentStatus.PAID, true);
    },
  );

  it('retains revenue when payment commits before cancellation', async () => {
    const booking = await createBooking(PaymentStatus.UNPAID);
    expect((await pay(booking.id)).status).toBe(200);
    expect((await cancel(booking.id, 'admin')).status).toBe(200);
    await expectRevenue(PaymentStatus.PAID, true);
  });

  it('rejects payment with 409 when cancellation commits first', async () => {
    const booking = await createBooking(PaymentStatus.UNPAID);
    expect((await cancel(booking.id, 'admin')).status).toBe(200);
    const payment = await pay(booking.id);
    expect(payment.status).toBe(409);
    expect(payment.body.code).toBe('BOOKING_STATE_CONFLICT');
    await expectRevenue(PaymentStatus.UNPAID, true);
  });

  it.each(['admin', 'customer'] as const)(
    '%s cancellation racing payment keeps revenue consistent with the winning transaction',
    async (actor) => {
      const booking = await createBooking(PaymentStatus.UNPAID);
      const [payment, cancellation] = await Promise.all([
        pay(booking.id),
        cancel(booking.id, actor),
      ]);
      expect(cancellation.status).toBe(200);
      expect([200, 409]).toContain(payment.status);
      const persisted = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(persisted.status).toBe(BookingStatus.CANCELLED);
      expect(persisted.totalAmount.toFixed(2)).toBe('100.00');
      if (payment.status === 200) {
        expect(persisted.paymentStatus).toBe(PaymentStatus.PAID);
        expect(persisted.paymentMethod).toBe(PaymentMethod.CASH);
        await expectRevenue(PaymentStatus.PAID, true);
      } else {
        expect(payment.body.code).toBe('BOOKING_STATE_CONFLICT');
        expect(persisted.paymentStatus).toBe(PaymentStatus.UNPAID);
        expect(persisted.paymentMethod).toBeNull();
        await expectRevenue(PaymentStatus.UNPAID, true);
      }
    },
  );
});
