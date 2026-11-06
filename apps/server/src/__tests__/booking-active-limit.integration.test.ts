import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { TestAccounts } from './support/test-accounts.js';
import { drainBackgroundTasks } from '../utils/background-tasks.util.js';
import { ENV } from '../config/env.config.js';

/**
 * CWB-78: a customer may hold at most BOOKING_MAX_ACTIVE_PER_CUSTOMER (default 5) upcoming
 * CONFIRMED bookings. The check runs inside the booking transaction after the customer's row is
 * locked, so concurrent requests for different rooms cannot both pass it.
 */
describe('Upcoming booking cap per customer (CWB-78, real MySQL)', () => {
  const accounts = new TestAccounts();
  afterAll(() => accounts.cleanup());

  const tag = randomUUID().slice(0, 8);
  const roomIds: string[] = [];
  const customerIds: string[] = [];
  let adminToken: string;
  let dayOffset = 1;
  let codeSeq = 0;

  // Each call returns a 09:00-10:00 Vietnam slot on a new future day (well inside the horizon).
  const nextSlot = () => {
    const base = new Date();
    base.setUTCHours(2, 0, 0, 0);
    const start = new Date(base.getTime() + dayOffset++ * 86_400_000);
    return { start, end: new Date(start.getTime() + 3_600_000) };
  };

  const newCustomer = async () => {
    const id = randomUUID();
    const token = await accounts.create(Role.CUSTOMER, id);
    customerIds.push(id);
    return { id, token };
  };

  const insertBooking = (
    userId: string,
    status: BookingStatus = BookingStatus.CONFIRMED,
    slot: { start: Date; end: Date } = nextSlot(),
  ) =>
    prisma.booking.create({
      data: {
        bookingCode: `CAP-${tag}-${++codeSeq}`,
        userId,
        roomId: roomIds[0],
        startTime: slot.start,
        endTime: slot.end,
        totalAmount: new Prisma.Decimal('100000.00'),
        status,
      },
    });

  const post = (token: string, roomId: string, key?: string) => {
    const { start, end } = nextSlot();
    const req = request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${token}`);
    if (key) req.set('Idempotency-Key', key);
    return req.send({ roomId, startTime: start.toISOString(), endTime: end.toISOString() });
  };

  const upcomingCount = (userId: string) =>
    prisma.booking.count({
      where: { userId, status: BookingStatus.CONFIRMED, startTime: { gte: new Date() } },
    });

  beforeAll(async () => {
    expect(ENV.BOOKING_MAX_ACTIVE_PER_CUSTOMER).toBe(5);
    for (const label of ['A', 'B']) {
      const room = await prisma.room.create({
        data: {
          name: `Cap ${label} ${tag}`,
          capacity: 4,
          pricePerHour: new Prisma.Decimal('100000.00'),
          status: RoomStatus.AVAILABLE,
        },
      });
      roomIds.push(room.id);
    }
    adminToken = await accounts.create(Role.ADMIN);
  });

  afterAll(async () => {
    await drainBackgroundTasks(5000);
    await prisma.booking.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
  });

  it('rejects the 6th upcoming booking with 409 ACTIVE_BOOKING_LIMIT and persists nothing', async () => {
    const customer = await newCustomer();
    for (let i = 0; i < 5; i++) await insertBooking(customer.id);

    const res = await post(customer.token, roomIds[1]);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      code: 'ACTIVE_BOOKING_LIMIT',
      details: { limit: 5 },
    });
    expect(res.body.message).toContain('5');
    expect(await upcomingCount(customer.id)).toBe(5);
    expect(await prisma.booking.count({ where: { userId: customer.id, roomId: roomIds[1] } })).toBe(
      0,
    );
  });

  it('counts only upcoming CONFIRMED bookings: past, cancelled, completed and no-show ones do not count', async () => {
    const customer = await newCustomer();
    for (let i = 0; i < 4; i++) await insertBooking(customer.id);
    await insertBooking(customer.id, BookingStatus.CANCELLED);
    await insertBooking(customer.id, BookingStatus.COMPLETED);
    await insertBooking(customer.id, BookingStatus.NO_SHOW);
    const yesterday = new Date(Date.now() - 86_400_000);
    await insertBooking(customer.id, BookingStatus.CONFIRMED, {
      start: yesterday,
      end: new Date(yesterday.getTime() + 3_600_000),
    });

    const fifth = await post(customer.token, roomIds[1]);
    expect(fifth.status).toBe(201);

    const sixth = await post(customer.token, roomIds[1]);
    expect(sixth.status).toBe(409);
    expect(sixth.body.code).toBe('ACTIVE_BOOKING_LIMIT');
  });

  it('lets only one of two concurrent requests for different rooms take the last place', async () => {
    const customer = await newCustomer();
    for (let i = 0; i < 4; i++) await insertBooking(customer.id);

    const results = await Promise.all([
      post(customer.token, roomIds[0]),
      post(customer.token, roomIds[1]),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe('ACTIVE_BOOKING_LIMIT');
    expect(await upcomingCount(customer.id)).toBe(5);
  });

  it('frees a place when the customer cancels an upcoming booking', async () => {
    const customer = await newCustomer();
    const [first] = await Promise.all(Array.from({ length: 5 }, () => insertBooking(customer.id)));
    expect((await post(customer.token, roomIds[1])).status).toBe(409);

    const cancel = await request(app)
      .patch(`/api/v1/bookings/${first.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({});
    expect(cancel.status).toBe(200);

    expect((await post(customer.token, roomIds[1])).status).toBe(201);
  });

  it('still replays an idempotent retry of a booking that reached the cap', async () => {
    const customer = await newCustomer();
    for (let i = 0; i < 4; i++) await insertBooking(customer.id);
    const key = randomUUID();
    const { start, end } = nextSlot();
    const body = { roomId: roomIds[1], startTime: start.toISOString(), endTime: end.toISOString() };
    const send = () =>
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customer.token}`)
        .set('Idempotency-Key', key)
        .send(body);

    const first = await send();
    const retry = await send();

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await upcomingCount(customer.id)).toBe(5);
  });

  it('does not limit admin guest bookings', async () => {
    for (let i = 0; i < 6; i++) {
      const { start, end } = nextSlot();
      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: roomIds[1],
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          guestName: 'Khách vãng lai',
          guestPhone: '0901234567',
        });
      expect(res.status).toBe(201);
    }
  });
});
