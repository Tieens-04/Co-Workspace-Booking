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
        },
      });
      userIds.push(user.id);
      tokens.push(generateToken({ sub: user.id, role: Role.CUSTOMER }));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await drainBackgroundTasks(5000);
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
});
