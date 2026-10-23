import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, Prisma, Role } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';

describe('CWB-38 booking lifecycle (real MySQL)', () => {
  let roomId: string;
  let userId: string;
  let customerToken: string;
  let adminToken: string;
  const end = new Date('2030-01-02T12:00:00.000Z');

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `lifecycle-${randomUUID()}@example.com`,
        passwordHash: 'test-hash',
        fullName: 'Lifecycle customer',
      },
    });
    userId = user.id;
    customerToken = generateToken({ sub: userId, role: Role.CUSTOMER });
    adminToken = generateToken({ sub: userId, role: Role.ADMIN });
    const room = await prisma.room.create({
      data: {
        name: `Lifecycle ${randomUUID()}`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100.00'),
      },
    });
    roomId = room.id;
  });

  beforeEach(async () => {
    await prisma.booking.deleteMany({ where: { roomId } });
  });

  afterAll(async () => {
    if (roomId) {
      await prisma.booking.deleteMany({ where: { roomId } });
      await prisma.room.delete({ where: { id: roomId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function seedBooking(endTime = end, status: BookingStatus = BookingStatus.CONFIRMED) {
    return prisma.booking.create({
      data: {
        roomId,
        userId,
        bookingCode: `CS-20300102-${randomUUID()}`,
        startTime: new Date(endTime.getTime() - 2 * 60 * 60 * 1000),
        endTime,
        totalAmount: new Prisma.Decimal('200.00'),
        // CWB-38 verifies the legacy manual lifecycle; tracked attendance is covered in CWB-39.
        attendanceTrackingEnabled: false,
        status,
      },
    });
  }

  const actions = [
    { path: 'complete', method: 'completeBookingForAdmin', target: BookingStatus.COMPLETED },
    { path: 'no-show', method: 'markNoShowForAdmin', target: BookingStatus.NO_SHOW },
  ] as const;

  for (const action of actions) {
    it(`${action.path} rejects a future booking and keeps its slot blocked`, async () => {
      const futureEnd = new Date(Date.now() + 74 * 60 * 60 * 1000);
      futureEnd.setUTCMinutes(0, 0, 0);
      const booking = await seedBooking(futureEnd);
      const result = await request(app)
        .patch(`/api/v1/admin/bookings/${booking.id}/${action.path}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(result.status).toBe(409);
      expect(result.body.code).toBe('BOOKING_STATE_CONFLICT');
      const duplicate = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId,
          startTime: booking.startTime.toISOString(),
          endTime: booking.endTime.toISOString(),
        });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('BOOKING_CONFLICT');
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        'CONFIRMED',
      );
      expect(await prisma.booking.count({ where: { roomId } })).toBe(1);
    });

    for (const kind of ['customer', 'guest'] as const) {
      it(`${action.path} racing with ${kind} create cannot release a future slot`, async () => {
        const futureEnd = new Date(Date.now() + 74 * 60 * 60 * 1000);
        futureEnd.setUTCMinutes(0, 0, 0);
        const booking = await seedBooking(futureEnd);
        const [transition, create] = await Promise.all([
          request(app)
            .patch(`/api/v1/admin/bookings/${booking.id}/${action.path}`)
            .set('Authorization', `Bearer ${adminToken}`),
          request(app)
            .post(kind === 'customer' ? '/api/v1/bookings' : '/api/v1/admin/bookings/guest')
            .set('Authorization', `Bearer ${kind === 'customer' ? customerToken : adminToken}`)
            .send({
              roomId,
              startTime: booking.startTime.toISOString(),
              endTime: booking.endTime.toISOString(),
              ...(kind === 'guest' ? { guestName: 'Guest', guestPhone: '0901234567' } : {}),
            }),
        ]);
        expect(transition.status).toBe(409);
        expect(transition.body.code).toBe('BOOKING_STATE_CONFLICT');
        expect(create.status).toBe(409);
        expect(create.body.code).toBe('BOOKING_CONFLICT');
        expect(await prisma.booking.count({ where: { roomId } })).toBe(1);
        expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
          'CONFIRMED',
        );
      });
    }

    it.each([-1, 0, 1])(`${action.path} enforces endTime boundary (%i ms)`, async (offset) => {
      const booking = await seedBooking();
      const operation = bookingRepository[action.method](
        booking.id,
        () => new Date(end.getTime() + offset),
      );
      if (offset < 0) {
        await expect(operation).rejects.toMatchObject({
          statusCode: 409,
          code: 'BOOKING_STATE_CONFLICT',
        });
      } else {
        await expect(operation).resolves.toMatchObject({ status: action.target });
      }
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        offset < 0 ? BookingStatus.CONFIRMED : action.target,
      );
    });

    it(`${action.path} evaluates the clock only after acquiring the booking lock`, async () => {
      const booking = await seedBooking();
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
      let now = new Date(end.getTime() - 1);
      let clockRead = false;
      const operation = bookingRepository[action.method](booking.id, () => {
        clockRead = true;
        return now;
      });
      // Attach rejection handling immediately, including if the implementation regresses.
      const result = operation.then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error }),
      );
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(clockRead).toBe(false);
        now = end;
      } finally {
        unlock();
        await blocker;
      }
      expect((await result).error).toBeNull();
      expect((await result).value?.status).toBe(action.target);
      expect(clockRead).toBe(true);
    });

    it(`${action.path} preserves idempotency, terminal conflicts and missing records`, async () => {
      const repeated = await seedBooking(end, action.target);
      await expect(bookingRepository[action.method](repeated.id)).resolves.toMatchObject({
        status: action.target,
      });
      for (const status of [
        BookingStatus.CANCELLED,
        action.target === 'COMPLETED' ? BookingStatus.NO_SHOW : BookingStatus.COMPLETED,
      ]) {
        const booking = await seedBooking(end, status);
        await expect(bookingRepository[action.method](booking.id)).rejects.toMatchObject({
          statusCode: 409,
        });
      }
      await expect(bookingRepository[action.method](randomUUID())).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  }
});
