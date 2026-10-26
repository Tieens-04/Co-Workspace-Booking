import { randomUUID } from 'node:crypto';
import { BookingStatus, PaymentStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app.js';
import * as roomRepository from '../repositories/room.repository.js';
import * as bookingCodeUtil from '../utils/booking-code.util.js';
import { generateToken } from '../utils/jwt.util.js';
import prisma from '../utils/prisma.util.js';

const start = new Date('2030-06-10T02:00:00.000Z'); // 09:00 Vietnam
const end = new Date('2030-06-10T03:30:00.000Z');
const leadBoundary = start.getTime() - 30 * 60 * 1000;

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 2500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe.each([
  { kind: 'CUSTOMER', role: Role.CUSTOMER, path: '/api/v1/bookings' },
  { kind: 'GUEST', role: Role.ADMIN, path: '/api/v1/admin/bookings/guest' },
])('$kind booking lead time (real MySQL transactions)', ({ kind, role, path }) => {
  let userId: string;
  let roomId: string;
  let collisionRoomId: string;
  let token: string;

  beforeEach(async () => {
    userId = randomUUID();
    roomId = randomUUID();
    collisionRoomId = randomUUID();
    // Keep sockets, transaction deadlines, and barriers on real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(leadBoundary - 1);
    await prisma.user.create({
      data: {
        id: userId,
        email: `lead_${userId}@example.com`,
        fullName: 'Lead time test',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        role,
      },
    });
    await prisma.room.createMany({
      data: [roomId, collisionRoomId].map((id) => ({
        id,
        name: `lead_${id}`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100.55'),
        status: RoomStatus.AVAILABLE,
      })),
    });
    // JWT issue/expiry times must use the same frozen clock as the API.
    token = generateToken({ sub: userId, role });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await prisma.booking.deleteMany({ where: { roomId: { in: [roomId, collisionRoomId] } } });
    await prisma.room.deleteMany({ where: { id: { in: [roomId, collisionRoomId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function createBooking() {
    return request(app)
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .timeout({ response: 4000, deadline: 5000 })
      .send({
        roomId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        ...(kind === 'GUEST' ? { guestName: 'Lead time guest', guestPhone: '0901234567' } : {}),
      });
  }

  async function createAfterLockWait(evaluationTime: number) {
    const locked = signal();
    const release = signal();
    const entered = signal();
    const realLockRoomRow = roomRepository.lockRoomRow;
    const blocker = prisma.$transaction(
      async (tx) => {
        await realLockRoomRow(tx, roomId);
        locked.resolve();
        await release.promise;
      },
      { timeout: 8000 },
    );
    // Attach a rejection handler immediately, even if a barrier fails first.
    void blocker.catch(() => {});
    let pendingRequest: Promise<request.Response> | undefined;
    let settled = false;
    let acquired = false;
    try {
      await bounded(locked.promise, 'blocker room lock');
      vi.spyOn(roomRepository, 'lockRoomRow').mockImplementation(async (tx, id) => {
        entered.resolve();
        const room = await realLockRoomRow(tx, id);
        acquired = true;
        return room;
      });
      pendingRequest = createBooking().then((response) => {
        settled = true;
        return response;
      });
      void pendingRequest.catch(() => {});
      await bounded(entered.promise, 'API room lock entry');
      // Allow real database I/O to reach the held FOR UPDATE, without advancing Date.
      await new Promise<void>((done) => setTimeout(done, 50));
      expect(settled).toBe(false);
      expect(acquired).toBe(false);
      vi.setSystemTime(evaluationTime);
      release.resolve();
      await blocker;
      const response = await pendingRequest;
      expect(acquired).toBe(true);
      return response;
    } finally {
      release.resolve();
      await Promise.allSettled([blocker, ...(pendingRequest ? [pendingRequest] : [])]);
      vi.restoreAllMocks();
    }
  }

  it('rejects a request that crosses the lead boundary while waiting for the room lock', async () => {
    const response = await createAfterLockWait(leadBoundary + 1);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('ADVANCE_NOTICE');
    expect(await prisma.booking.count({ where: { roomId } })).toBe(0);
  });

  it('accepts exactly 30 minutes and persists Decimal pricing and initial defaults', async () => {
    const response = await createAfterLockWait(leadBoundary);
    expect(response.status).toBe(201);
    expect(response.body.data.totalAmount).toBe('150.83');
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });
    expect(booking.totalAmount).toBeInstanceOf(Prisma.Decimal);
    expect(booking.totalAmount.toFixed(2)).toBe('150.83');
    expect(booking.status).toBe(BookingStatus.CONFIRMED);
    expect(booking.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect(booking.paymentMethod).toBeNull();
    expect(booking.checkedInAt).toBeNull();
    expect(booking.roomId).toBe(roomId);
    expect(booking.startTime).toEqual(start);
    expect(booking.endTime).toEqual(end);
    expect(booking.userId).toBe(kind === 'CUSTOMER' ? userId : null);
    expect(booking.guestName).toBe(kind === 'GUEST' ? 'Lead time guest' : null);
    expect(booking.guestPhone).toBe(kind === 'GUEST' ? '0901234567' : null);
  });

  it('revalidates the lead boundary on retry after a real unique-code collision', async () => {
    const dateSegment = bookingCodeUtil.getBookingDateSegment(start);
    let collisionCode: string;
    do {
      collisionCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;
    } while (await prisma.booking.findUnique({ where: { bookingCode: collisionCode } }));
    const existing = await prisma.booking.create({
      data: {
        bookingCode: collisionCode,
        roomId: collisionRoomId,
        userId,
        startTime: start,
        endTime: end,
        totalAmount: new Prisma.Decimal('150.83'),
      },
    });
    const realGenerateBookingCode = bookingCodeUtil.generateBookingCode;
    let attempts = 0;
    const codeSpy = vi.spyOn(bookingCodeUtil, 'generateBookingCode').mockImplementation((date) => {
      attempts++;
      if (attempts === 1) return collisionCode;
      vi.setSystemTime(leadBoundary + 1);
      return realGenerateBookingCode(date);
    });
    const response = await createBooking();
    expect(codeSpy).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('ADVANCE_NOTICE');
    expect(await prisma.booking.count({ where: { roomId } })).toBe(0);
    expect(await prisma.booking.findUnique({ where: { id: existing.id } })).toEqual(existing);
  });
});
