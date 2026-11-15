import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { TestAccounts } from './support/test-accounts.js';
import { hashPassword } from '../utils/password.util.js';
import { drainBackgroundTasks } from '../utils/background-tasks.util.js';
import { ENV } from '../config/env.config.js';
import { createBookingRateLimiter } from '../middlewares/rate-limit.middleware.js';

describe('Booking creation idempotency (CWB-66, real MySQL)', () => {
  // These scenarios reuse one customer for many upcoming bookings (overlap, code collisions,
  // outbox delivery). The CWB-78 per-customer cap is covered by booking-active-limit.integration.
  const defaultActiveBookingLimit = ENV.BOOKING_MAX_ACTIVE_PER_CUSTOMER;
  beforeAll(() => {
    ENV.BOOKING_MAX_ACTIVE_PER_CUSTOMER = 100;
  });
  afterAll(() => {
    ENV.BOOKING_MAX_ACTIVE_PER_CUSTOMER = defaultActiveBookingLimit;
  });

  const accounts = new TestAccounts();
  beforeAll(() => accounts.persist());
  afterAll(() => accounts.cleanup());

  const tag = randomUUID().slice(0, 8);
  let roomId: string;
  let otherRoomId: string;
  const userIds: string[] = [];
  const tokens: string[] = [];
  const adminToken = accounts.token(Role.ADMIN, `admin-${tag}`);
  const otherAdminToken = accounts.token(Role.ADMIN, `admin2-${tag}`);
  let dayOffset = 2;

  // Each test books its own future day at 09:00-11:00 Vietnam time.
  const nextSlot = () => {
    const base = new Date();
    base.setUTCHours(2, 0, 0, 0); // 09:00 VN
    const start = new Date(base.getTime() + dayOffset++ * 86_400_000);
    return {
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    };
  };
  const post = (token: string, body: object, key?: string) => {
    const req = request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${token}`);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const postGuest = (token: string, body: object, key?: string) => {
    const req = request(app)
      .post('/api/v1/admin/bookings/guest')
      .set('Authorization', `Bearer ${token}`);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const countIn = (room: string) => prisma.booking.count({ where: { roomId: room } });

  beforeAll(async () => {
    const rooms = await Promise.all(
      ['A', 'B'].map((label) =>
        prisma.room.create({
          data: {
            name: `Idem ${label} ${tag}`,
            capacity: 4,
            pricePerHour: new Prisma.Decimal('100000.00'),
            status: RoomStatus.AVAILABLE,
          },
        }),
      ),
    );
    [roomId, otherRoomId] = rooms.map((r) => r.id);
    for (const label of ['one', 'two']) {
      const user = await prisma.user.create({
        data: {
          email: `idem_${tag}_${label}@example.com`,
          passwordHash: await hashPassword('Password123!'),
          fullName: `Khách ${label}`,
          emailVerifiedAt: new Date(),
        },
      });
      userIds.push(user.id);
      tokens.push(generateToken({ sub: user.id, role: Role.CUSTOMER }));
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await Promise.all(userIds.map((id) => createBookingRateLimiter.resetKey(`user:${id}`)));
  });

  afterAll(async () => {
    await drainBackgroundTasks(5000);
    await prisma.auditEvent.deleteMany({
      where: { actorId: { in: [`admin-${tag}`, `admin2-${tag}`] } },
    });
    await prisma.booking.deleteMany({ where: { roomId: { in: [roomId, otherRoomId] } } });
    await prisma.room.deleteMany({ where: { id: { in: [roomId, otherRoomId] } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('returns the original booking when a request is retried after its response was lost', async () => {
    const key = randomUUID();
    const body = { roomId, ...nextSlot(), note: 'Ghi chú' };
    const before = await countIn(roomId);

    const first = await post(tokens[0], body, key);
    // The client never saw `first`; it retries the same intent with the same key.
    const retry = await post(tokens[0], { ...body, note: '  Ghi chú  ' }, key);
    await drainBackgroundTasks(5000);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.data).toEqual(first.body.data);
    expect(retry.body.data).not.toHaveProperty('idempotentReplay');
    expect(await countIn(roomId)).toBe(before + 1);
    // CWB-68: the replay queues no second confirmation email.
    expect(await prisma.emailOutbox.count({ where: { bookingId: first.body.data.id } })).toBe(1);
  });

  it('serializes concurrent requests with the same key into one booking', async () => {
    const key = randomUUID();
    const body = { roomId, ...nextSlot() };
    const before = await countIn(roomId);

    const results = await Promise.all([1, 2, 3].map(() => post(tokens[0], body, key)));

    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(await countIn(roomId)).toBe(before + 1);
  });

  it('rejects the same key with a different payload and creates nothing', async () => {
    const key = randomUUID();
    const slot = nextSlot();
    expect((await post(tokens[0], { roomId, ...slot }, key)).status).toBe(201);
    const before = await countIn(otherRoomId);

    const res = await post(tokens[0], { roomId: otherRoomId, ...slot }, key);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await countIn(otherRoomId)).toBe(before);
  });

  it('scopes keys per caller: the same key from another customer is a separate booking', async () => {
    const key = randomUUID();
    const first = await post(tokens[0], { roomId, ...nextSlot() }, key);
    const second = await post(tokens[1], { roomId, ...nextSlot() }, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).not.toBe(first.body.data.id);
  });

  it('still enforces overlap for a new key on an already booked slot', async () => {
    const slot = nextSlot();
    expect((await post(tokens[0], { roomId, ...slot }, randomUUID())).status).toBe(201);
    const res = await post(tokens[1], { roomId, ...slot }, randomUUID());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CONFLICT');
  });

  it('keeps requests without a key working as before', async () => {
    const slot = nextSlot();
    expect((await post(tokens[0], { roomId, ...slot })).status).toBe(201);
    expect((await post(tokens[0], { roomId, ...slot })).status).toBe(409);
  });

  it.each(['short', 'has space key!', 'x'.repeat(65)])('rejects malformed key %j', async (key) => {
    const res = await post(tokens[0], { roomId, ...nextSlot() }, key);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('applies to admin guest bookings, scoped per admin', async () => {
    const key = randomUUID();
    const body = { roomId, ...nextSlot(), guestName: 'Khách lẻ', guestPhone: '0912345678' };

    const first = await postGuest(adminToken, body, key);
    const retry = await postGuest(adminToken, body, key);
    const otherAdmin = await postGuest(otherAdminToken, { ...body, ...nextSlot() }, key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(retry.body.data.customer).toMatchObject({ kind: 'GUEST', name: 'Khách lẻ' });
    expect(otherAdmin.status).toBe(201);
    expect(otherAdmin.body.data.id).not.toBe(first.body.data.id);
  });

  it('replays a customer booking when retried with the same key after crossing the 30-minute lead-time boundary', async () => {
    const key = randomUUID();
    const slot = nextSlot();
    const body = { roomId, ...slot, note: 'Retry qua mốc 30 phút' };
    const before = await countIn(roomId);
    const startMs = new Date(slot.startTime).getTime();

    let first: request.Response;
    let retry: request.Response;
    let reusedDifferentPayload: request.Response;
    let retryAfterStart: request.Response;
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(startMs - 30 * 60_000 - 10_000);
      const freshCustomerToken = generateToken({ sub: userIds[0], role: Role.CUSTOMER });
      first = await post(freshCustomerToken, body, key);

      vi.setSystemTime(startMs - 20 * 60_000);
      retry = await post(freshCustomerToken, body, key);
      reusedDifferentPayload = await post(
        freshCustomerToken,
        { ...body, note: 'Đổi nội dung ghi chú' },
        key,
      );

      vi.setSystemTime(startMs + 5 * 60_000);
      const postStartToken = generateToken({ sub: userIds[0], role: Role.CUSTOMER });
      retryAfterStart = await post(postStartToken, body, key);
    } finally {
      vi.useRealTimers();
    }
    await drainBackgroundTasks(5000);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.data).toEqual(first.body.data);
    expect(reusedDifferentPayload.status).toBe(409);
    expect(reusedDifferentPayload.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(retryAfterStart.status).toBe(200);
    expect(retryAfterStart.headers['idempotent-replayed']).toBe('true');
    expect(retryAfterStart.body.data).toEqual(first.body.data);
    expect(await countIn(roomId)).toBe(before + 1);
    expect(await prisma.emailOutbox.count({ where: { bookingId: first.body.data.id } })).toBe(1);
  });

  it('replays an admin guest booking when retried with the same key after crossing the 30-minute lead-time boundary', async () => {
    const key = randomUUID();
    const slot = nextSlot();
    const body = { roomId, ...slot, guestName: 'Khách trễ mạng', guestPhone: '0912345678' };
    const before = await countIn(roomId);
    const startMs = new Date(slot.startTime).getTime();

    let first: request.Response;
    let retry: request.Response;
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(startMs - 30 * 60_000 - 10_000);
      const freshAdminToken = generateToken({ sub: `admin-${tag}`, role: Role.ADMIN });
      first = await postGuest(freshAdminToken, body, key);

      vi.setSystemTime(startMs - 20 * 60_000);
      retry = await postGuest(freshAdminToken, body, key);
    } finally {
      vi.useRealTimers();
    }

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.data).toEqual(first.body.data);
    expect(await countIn(roomId)).toBe(before + 1);
    expect(
      await prisma.auditEvent.count({
        where: {
          entityType: 'BOOKING',
          entityId: first.body.data.id,
          action: 'BOOKING_GUEST_CREATED',
        },
      }),
    ).toBe(1);
  });

  it('still rejects a new Idempotency-Key within 30 minutes of start via in-transaction time validation', async () => {
    const slot = nextSlot();
    const before = await countIn(roomId);
    const startMs = new Date(slot.startTime).getTime();

    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(startMs - 20 * 60_000);
      const freshCustomerToken = generateToken({ sub: userIds[0], role: Role.CUSTOMER });
      const res = await post(freshCustomerToken, { roomId, ...slot }, randomUUID());
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ADVANCE_NOTICE');
    } finally {
      vi.useRealTimers();
    }

    expect(await countIn(roomId)).toBe(before);
  });

  it('prioritizes 400 time-rule errors over 409 conflicts and 500 date-range errors for a new Idempotency-Key', async () => {
    const slot = nextSlot();
    const startMs = new Date(slot.startTime).getTime();

    const booked = await post(tokens[0], { roomId, ...slot }, randomUUID());
    expect(booked.status).toBe(201);

    const backwardsStart = new Date(startMs + 90 * 60_000).toISOString();
    const backwardsEnd = new Date(startMs + 30 * 60_000).toISOString();
    const backwardsRes = await post(
      tokens[1],
      { roomId, startTime: backwardsStart, endTime: backwardsEnd },
      randomUUID(),
    );
    expect(backwardsRes.status).toBe(400);
    expect(backwardsRes.body.code).toBe('INVALID_SLOT');

    let lateOverlapRes: request.Response;
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(startMs - 20 * 60_000);
      const freshToken = generateToken({ sub: userIds[1], role: Role.CUSTOMER });
      lateOverlapRes = await post(freshToken, { roomId, ...slot }, randomUUID());
    } finally {
      vi.useRealTimers();
    }
    expect(lateOverlapRes.status).toBe(400);
    expect(lateOverlapRes.body.code).toBe('ADVANCE_NOTICE');

    const extremeOffsetRes = await post(
      tokens[1],
      {
        roomId,
        startTime: '9999-12-31T21:00:00-23:00',
        endTime: '9999-12-31T22:00:00-23:00',
      },
      randomUUID(),
    );
    expect(extremeOffsetRes.status).toBe(400);
    expect(extremeOffsetRes.body.code).toBe('BOOKING_HORIZON');
  });
});
