import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Prisma, Role } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { notificationService } from '../services/notification.service.js';
import { lockRoomRow } from '../repositories/room.repository.js';

const db = vi.hoisted(() => {
  const tx = { booking: { findMany: vi.fn(), create: vi.fn() } };
  return { tx, transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(tx)) };
});

vi.mock('../utils/prisma.util.js', () => ({ default: { $transaction: db.transaction } }));
vi.mock('../repositories/room.repository.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../repositories/room.repository.js')>()),
  lockRoomRow: vi.fn(),
}));

const roomId = '11111111-1111-4111-8111-111111111111';
const start = new Date('2026-11-01T10:00:00+07:00');
const end = new Date('2026-11-01T11:30:00+07:00');
const boundary = start.getTime() - 30 * 60_000;
const room = {
  id: roomId,
  name: 'Lead time room',
  status: 'AVAILABLE' as const,
  pricePerHour: new Prisma.Decimal('100.01'),
};

describe('Booking lead time at the persistence boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: boundary - 1 });
    vi.mocked(lockRoomRow).mockResolvedValue(room);
    db.tx.booking.findMany.mockResolvedValue([]);
    db.tx.booking.create.mockResolvedValue({
      id: 'booking-id',
      bookingCode: 'CS-20261101-TEST',
      room,
      startTime: start,
      endTime: end,
      checkedInAt: null,
      attendanceTrackingEnabled: true,
      totalAmount: new Prisma.Decimal('150.02'),
      note: null,
      status: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      paymentMethod: null,
    });
    vi.spyOn(notificationService, 'sendBookingConfirmation').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  function send(kind: 'CUSTOMER' | 'GUEST') {
    const token = generateToken({
      sub: 'customer-id',
      role: kind === 'GUEST' ? Role.ADMIN : Role.CUSTOMER,
    });
    return request(app)
      .post(kind === 'GUEST' ? '/api/v1/admin/bookings/guest' : '/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        roomId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        ...(kind === 'GUEST' ? { guestName: 'Guest', guestPhone: '0901234567' } : {}),
      });
  }

  for (const kind of ['CUSTOMER', 'GUEST'] as const) {
    it(`${kind}: rejects a request that expires while acquiring the room lock`, async () => {
      vi.mocked(lockRoomRow).mockImplementationOnce(async () => {
        vi.setSystemTime(boundary + 1);
        return room;
      });
      const response = await send(kind);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('ADVANCE_NOTICE');
      expect(db.tx.booking.create).not.toHaveBeenCalled();
      expect(notificationService.sendBookingConfirmation).not.toHaveBeenCalled();
    });

    it.each([0, -1])(
      `${kind}: accepts %s ms relative to the exact lead-time boundary`,
      async (offset) => {
        vi.mocked(lockRoomRow).mockImplementationOnce(async () => {
          vi.setSystemTime(boundary + offset);
          return room;
        });
        // Avoid a customer lookup after the successful transaction in this isolated unit test.
        const { userRepository } = await import('../repositories/user.repository.js');
        vi.spyOn(userRepository, 'findById').mockResolvedValue(null);
        const response = await send(kind);
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
          totalAmount: '150.02',
          status: 'CONFIRMED',
          paymentStatus: 'UNPAID',
        });
        expect(db.tx.booking.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ totalAmount: new Prisma.Decimal('150.02') }),
          }),
        );
      },
    );

    it(`${kind}: reads a fresh clock on a booking-code collision retry`, async () => {
      db.tx.booking.create.mockImplementationOnce(async () => {
        vi.setSystemTime(boundary + 1);
        throw new Prisma.PrismaClientKnownRequestError('Code collision', {
          code: 'P2002',
          clientVersion: '6',
          meta: { target: 'bookings_booking_code_key' },
        });
      });
      const response = await send(kind);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('ADVANCE_NOTICE');
      expect(db.transaction).toHaveBeenCalledTimes(2);
      expect(lockRoomRow).toHaveBeenCalledTimes(2);
      expect(db.tx.booking.create).toHaveBeenCalledTimes(1);
      expect(notificationService.sendBookingConfirmation).not.toHaveBeenCalled();
    });
  }

  it('rejects when time expires during the overlap query after locking', async () => {
    db.tx.booking.findMany.mockImplementationOnce(async () => {
      vi.setSystemTime(boundary + 1);
      return [];
    });
    const response = await send('CUSTOMER');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('ADVANCE_NOTICE');
    expect(db.tx.booking.create).not.toHaveBeenCalled();
    expect(notificationService.sendBookingConfirmation).not.toHaveBeenCalled();
  });
});
