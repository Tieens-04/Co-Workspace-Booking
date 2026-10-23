import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, PaymentStatus, Prisma, Role } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { generateToken } from '../utils/jwt.util.js';

describe('CWB-39 attendance with real MySQL', () => {
  let roomId: string;
  let userId: string;
  let adminToken: string;
  let customerToken: string;
  const start = new Date('2030-01-02T10:00:00.000Z');
  const end = new Date('2030-01-02T12:00:00.000Z');

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `checkin-${randomUUID()}@example.com`,
        passwordHash: 'test-hash',
        fullName: 'Check-in customer',
      },
    });
    userId = user.id;
    adminToken = generateToken({ sub: userId, role: Role.ADMIN });
    customerToken = generateToken({ sub: userId, role: Role.CUSTOMER });
    const room = await prisma.room.create({
      data: {
        name: `Check-in ${randomUUID()}`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100.00'),
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    if (roomId) {
      await prisma.booking.deleteMany({ where: { roomId } });
      await prisma.room.delete({ where: { id: roomId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  function seed(overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
    return prisma.booking.create({
      data: {
        roomId,
        userId,
        bookingCode: `CS-20300102-${randomUUID()}`,
        startTime: start,
        endTime: end,
        totalAmount: new Prisma.Decimal('200.00'),
        ...overrides,
      },
    });
  }

  it.each([-1, 0, 1])('checks startTime boundary (%i ms)', async (offset) => {
    const booking = await seed();
    const at = new Date(start.getTime() + offset);
    const operation = bookingRepository.checkInBookingForAdmin(booking.id, () => at);
    if (offset < 0) await expect(operation).rejects.toMatchObject({ statusCode: 409 });
    else
      await expect(operation).resolves.toMatchObject({
        checkedInAt: at,
        paymentStatus: 'UNPAID',
        status: 'CONFIRMED',
      });
  });

  it.each([-1, 0, 1])('checks endTime boundary (%i ms)', async (offset) => {
    const booking = await seed();
    const at = new Date(end.getTime() + offset);
    const operation = bookingRepository.checkInBookingForAdmin(booking.id, () => at);
    if (offset >= 0) await expect(operation).rejects.toMatchObject({ statusCode: 409 });
    else await expect(operation).resolves.toMatchObject({ checkedInAt: at });
  });

  for (const paymentStatus of [PaymentStatus.PAID, PaymentStatus.UNPAID]) {
    for (const attended of [true, false]) {
      it(`${paymentStatus}, attended=${attended}: evaluation and completion use attendance only`, async () => {
        const booking = await seed({ paymentStatus, checkedInAt: attended ? start : null });
        await bookingRepository.evaluateNoShowBookings(end, userId);
        const persisted = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
        expect(persisted.status).toBe(attended ? 'CONFIRMED' : 'NO_SHOW');
        expect(persisted.paymentStatus).toBe(paymentStatus);
        expect(await bookingRepository.evaluateNoShowBookings(end, userId)).toBe(0);
        if (attended) {
          await expect(
            bookingRepository.markNoShowForAdmin(booking.id, () => end),
          ).rejects.toMatchObject({ statusCode: 409 });
          await expect(
            bookingRepository.completeBookingForAdmin(booking.id, () => end),
          ).resolves.toMatchObject({ status: 'COMPLETED', checkedInAt: start });
        } else {
          await expect(
            bookingRepository.completeBookingForAdmin(booking.id, () => end),
          ).rejects.toMatchObject({ statusCode: 409 });
        }
      });
    }
  }

  it('rejects completion without attendance before any lazy read', async () => {
    const booking = await seed();
    await expect(
      bookingRepository.completeBookingForAdmin(booking.id, () => end),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('keeps legacy records for explicit admin resolution', async () => {
    for (const paymentStatus of [PaymentStatus.PAID, PaymentStatus.UNPAID]) {
      const booking = await seed({ paymentStatus, attendanceTrackingEnabled: false });
      await bookingRepository.evaluateNoShowBookings(end, userId);
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        'CONFIRMED',
      );
      await expect(
        bookingRepository.completeBookingForAdmin(booking.id, () => end),
      ).resolves.toMatchObject({ status: 'COMPLETED', checkedInAt: null });
    }
    const booking = await seed({ attendanceTrackingEnabled: false });
    await expect(
      bookingRepository.markNoShowForAdmin(booking.id, () => end),
    ).resolves.toMatchObject({ status: 'NO_SHOW' });
  });

  it('writes attendance once across concurrent retries and completion', async () => {
    const booking = await seed();
    const [a, b] = await Promise.all([
      bookingRepository.checkInBookingForAdmin(booking.id, () => start),
      bookingRepository.checkInBookingForAdmin(booking.id, () => new Date(start.getTime() + 1)),
    ]);
    expect(a.checkedInAt).toEqual(b.checkedInAt);
    await bookingRepository.completeBookingForAdmin(booking.id, () => end);
    await expect(
      bookingRepository.checkInBookingForAdmin(booking.id, () => end),
    ).resolves.toMatchObject({ status: 'COMPLETED', checkedInAt: a.checkedInAt });
  });

  it('rejects missing and terminal bookings', async () => {
    await expect(
      bookingRepository.checkInBookingForAdmin(randomUUID(), () => start),
    ).rejects.toMatchObject({ statusCode: 404 });
    for (const status of [
      BookingStatus.CANCELLED,
      BookingStatus.NO_SHOW,
      BookingStatus.COMPLETED,
    ]) {
      const booking = await seed({ status });
      await expect(
        bookingRepository.checkInBookingForAdmin(booking.id, () => start),
      ).rejects.toMatchObject({ statusCode: 409 });
    }
  });

  it('rechecks attendance when evaluation races a successful check-in', async () => {
    const booking = await seed();
    const [checkin] = await Promise.all(
      [
        bookingRepository.checkInBookingForAdmin(booking.id, () => start),
        bookingRepository.evaluateNoShowBookings(end, userId),
      ].map((operation) =>
        operation.then(
          (value) => ({ value, error: null }),
          (error: unknown) => ({ value: null, error }),
        ),
      ),
    );
    const persisted = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    if (checkin.error === null) {
      expect(persisted.checkedInAt).not.toBeNull();
      expect(persisted.status).toBe('CONFIRMED');
    } else {
      expect(checkin.error).toMatchObject({ statusCode: 409 });
      expect(persisted.checkedInAt).toBeNull();
      expect(persisted.status).toBe('NO_SHOW');
    }
  });

  it('rechecks a selected candidate after check-in commits before evaluator locking', async () => {
    const booking = await seed();
    let selected!: () => void;
    let resume!: () => void;
    const ready = new Promise<void>((resolve) => { selected = resolve; });
    const release = new Promise<void>((resolve) => { resume = resolve; });
    const findMany = prisma.booking.findMany.bind(prisma.booking);
    const spy = vi.spyOn(prisma.booking, 'findMany').mockImplementationOnce((args) => {
      const pending = (async () => {
        const candidates = await findMany(args);
        selected();
        await release;
        return candidates;
      })();
      return {
        then: pending.then.bind(pending),
        catch: pending.catch.bind(pending),
        finally: pending.finally.bind(pending),
        [Symbol.toStringTag]: 'PrismaPromise',
      };
    });
    const evaluation = bookingRepository.evaluateNoShowBookings(end, userId, booking.id);
    try {
      await ready;
      await bookingRepository.checkInBookingForAdmin(booking.id, () => start);
    } finally {
      resume();
      spy.mockRestore();
    }
    expect(await evaluation).toBe(0);
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: 'CONFIRMED', checkedInAt: start });
  });

  it('records attendance through the ADMIN API with and without an explicit empty body', async () => {
    const now = Date.now();
    const booking = await seed({ startTime: new Date(now - 60_000), endTime: new Date(now + 3_600_000) });
    const path = `/api/v1/admin/bookings/${booking.id}/check-in`;
    const first = await request(app).patch(path).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(first.status).toBe(200);
    expect(first.body.data.checkedInAt).toEqual(expect.any(String));
    expect(first.body.data.paymentStatus).toBe('UNPAID');
    const repeated = await request(app).patch(path).set('Authorization', `Bearer ${adminToken}`);
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.checkedInAt).toBe(first.body.data.checkedInAt);
  });

  it('uses the server clock after waiting on a row lock', async () => {
    const booking = await seed();
    let unlock!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM bookings WHERE id = ${booking.id} FOR UPDATE`);
      locked();
      await release;
    });
    await ready;
    let at = new Date(end.getTime() - 1);
    let clockRead = false;
    const pending = bookingRepository
      .checkInBookingForAdmin(booking.id, () => {
        clockRead = true;
        return at;
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(clockRead).toBe(false);
      at = end;
    } finally {
      unlock();
      await blocker;
    }
    expect(await pending).toMatchObject({ statusCode: 409 });
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).checkedInAt,
    ).toBeNull();
  });

  it('detail evaluates only the owned booking and agrees with list/dashboard/revenue', async () => {
    const pastEnd = new Date(Date.now() - 60_000);
    const booking = await seed({
      startTime: new Date(pastEnd.getTime() - 3_600_000),
      endTime: pastEnd,
    });
    const detail = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('NO_SHOW');
    const list = await request(app)
      .get('/api/v1/admin/bookings')
      .query({ bookingCode: booking.bookingCode })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data.items[0].status).toBe('NO_SHOW');
    for (const path of ['/api/v1/admin/dashboard/kpi', '/api/v1/admin/revenue']) {
      expect(
        (await request(app).get(path).set('Authorization', `Bearer ${adminToken}`)).status,
      ).toBe(200);
    }
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      'NO_SHOW',
    );
    const other = await seed({
      userId: null,
      guestName: 'Private guest',
      guestPhone: '0900000000',
      startTime: new Date(pastEnd.getTime() - 3_600_000),
      endTime: pastEnd,
    });
    expect(
      (
        await request(app)
          .get(`/api/v1/bookings/${other.id}`)
          .set('Authorization', `Bearer ${customerToken}`)
      ).status,
    ).toBe(404);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: other.id } })).status).toBe(
      'CONFIRMED',
    );
  });
});
