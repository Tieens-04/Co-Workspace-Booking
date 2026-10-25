import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Role, BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository, BookingRepository } from '../repositories/booking.repository.js';
import { BookingResponseDto, BLOCKING_BOOKING_STATUSES } from '../types/booking.type.js';
import { AppError } from '../utils/error.util.js';
import { isIntervalOverlapping } from '../utils/room-availability.util.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({
  default: {
    $transaction: vi.fn(),
  },
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock('../repositories/room.repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../repositories/room.repository.js')>();
  return {
    ...actual,
    lockRoomRow: vi.fn(),
  };
});

import prisma from '../utils/prisma.util.js';
import { lockRoomRow } from '../repositories/room.repository.js';

const validRoomId = '11111111-1111-4111-8111-111111111111';
const customerSub = 'customer-uuid-1';
const customerToken = generateToken({ sub: customerSub, role: Role.CUSTOMER });
const customer2Token = generateToken({ sub: 'customer-uuid-2', role: Role.CUSTOMER });

const createFixtureSlot = (hoursAhead: number, durationHours: number) => {
  const base = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  base.setUTCDate(base.getUTCDate() + 1);
  base.setUTCHours(2, 0, 0, 0); // 09:00 Vietnam
  const start = new Date(base.getTime());
  const end = new Date(base.getTime() + durationHours * 60 * 60 * 1000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    startDate: start,
    endDate: end,
  };
};

const mockBookingFixture = (override?: Partial<BookingResponseDto>): BookingResponseDto => {
  const slot = createFixtureSlot(5, 2);
  return {
    id: 'booking-fixture-uuid',
    bookingCode: 'CS-20261014-ABCD',
    room: {
      id: validRoomId,
      name: 'Creative Meeting Room',
    },
    startTime: slot.startDate,
    endTime: slot.endDate,
    totalAmount: '300000.00',
    note: 'Regression test booking',
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
    paymentMethod: null,
    checkedInAt: null,
    attendanceTrackingEnabled: true,
    ...override,
  };
};

describe('Critical Booking Regression & Edge-Case Unit Tests (CWB-28)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Scenario 1: Partial Overlap (AC 1)', () => {
    it('rejects booking when slot partially overlaps start of an existing booking (11:00 - 13:00 vs 10:00 - 12:00)', async () => {
      vi.spyOn(bookingRepository, 'createBooking').mockRejectedValueOnce(
        new AppError('BOOKING_CONFLICT', 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác', 409),
      );

      const slot = createFixtureSlot(4, 2);
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
      expect(res.body.message).toContain('Khung giờ này đã có người đặt');
    });

    it('rejects booking when slot partially overlaps end of an existing booking (09:00 - 11:00 vs 10:00 - 12:00)', async () => {
      vi.spyOn(bookingRepository, 'createBooking').mockRejectedValueOnce(
        new AppError('BOOKING_CONFLICT', 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác', 409),
      );

      const slot = createFixtureSlot(6, 2);
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
    });

    it('verifies mathematical overlap formula detects partial overlaps correctly', () => {
      // Existing: 10:00 - 12:00
      const existingStart = new Date('2026-10-15T10:00:00.000Z');
      const existingEnd = new Date('2026-10-15T12:00:00.000Z');

      // Requested 1: 11:00 - 13:00 (overlaps tail)
      const req1Start = new Date('2026-10-15T11:00:00.000Z');
      const req1End = new Date('2026-10-15T13:00:00.000Z');
      expect(isIntervalOverlapping(existingStart, existingEnd, req1Start, req1End)).toBe(true);

      // Requested 2: 09:00 - 11:00 (overlaps head)
      const req2Start = new Date('2026-10-15T09:00:00.000Z');
      const req2End = new Date('2026-10-15T11:00:00.000Z');
      expect(isIntervalOverlapping(existingStart, existingEnd, req2Start, req2End)).toBe(true);
    });
  });

  describe('Scenario 2: Requested Booking Fully Inside Existing Booking (AC 2)', () => {
    it('rejects booking when requested slot is completely inside an existing booking (10:30 - 11:30 vs 10:00 - 12:00)', async () => {
      vi.spyOn(bookingRepository, 'createBooking').mockRejectedValueOnce(
        new AppError('BOOKING_CONFLICT', 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác', 409),
      );

      const slot = createFixtureSlot(5, 1);
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
    });

    it('rejects booking when requested slot completely encloses an existing booking (09:00 - 13:00 vs 10:00 - 12:00)', async () => {
      vi.spyOn(bookingRepository, 'createBooking').mockRejectedValueOnce(
        new AppError('BOOKING_CONFLICT', 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác', 409),
      );

      const slot = createFixtureSlot(4, 4);
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
    });

    it('verifies mathematical overlap formula detects containment and enclosing correctly', () => {
      // Existing: 10:00 - 12:00
      const existingStart = new Date('2026-10-15T10:00:00.000Z');
      const existingEnd = new Date('2026-10-15T12:00:00.000Z');

      // Requested: 10:30 - 11:30 (fully inside existing)
      const insideStart = new Date('2026-10-15T10:30:00.000Z');
      const insideEnd = new Date('2026-10-15T11:30:00.000Z');
      expect(isIntervalOverlapping(existingStart, existingEnd, insideStart, insideEnd)).toBe(true);

      // Requested: 09:00 - 13:00 (enclosing existing)
      const enclosingStart = new Date('2026-10-15T09:00:00.000Z');
      const enclosingEnd = new Date('2026-10-15T13:00:00.000Z');
      expect(isIntervalOverlapping(existingStart, existingEnd, enclosingStart, enclosingEnd)).toBe(true);
    });
  });

  describe('Scenario 3: Boundary Touching (:00 / :30 Touching Is Allowed) (AC 3)', () => {
    it('allows booking that starts exactly when existing booking ends (existing ends 10:00, new starts 10:00)', async () => {
      const slot = createFixtureSlot(5, 2);
      const fixture = mockBookingFixture({
        startTime: slot.startDate,
        endTime: slot.endDate,
      });

      vi.spyOn(bookingRepository, 'createBooking').mockResolvedValueOnce(fixture);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(fixture.id);
      expect(res.body.data.status).toBe(BookingStatus.CONFIRMED);
    });

    it('allows booking that ends exactly when existing booking starts (new ends 10:00, existing starts 10:00)', async () => {
      const slot = createFixtureSlot(2, 2);
      const fixture = mockBookingFixture({
        startTime: slot.startDate,
        endTime: slot.endDate,
      });

      vi.spyOn(bookingRepository, 'createBooking').mockResolvedValueOnce(fixture);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(fixture.id);
    });

    it('verifies mathematical overlap formula evaluates boundary touching as non-overlapping', () => {
      const boundaryTime = new Date('2026-10-15T10:00:00.000Z');
      const earlierStart = new Date('2026-10-15T08:00:00.000Z');
      const laterEnd = new Date('2026-10-15T12:00:00.000Z');

      // Slot A: 08:00 - 10:00, Slot B: 10:00 - 12:00
      expect(isIntervalOverlapping(earlierStart, boundaryTime, boundaryTime, laterEnd)).toBe(false);
      expect(isIntervalOverlapping(boundaryTime, laterEnd, earlierStart, boundaryTime)).toBe(false);
    });
  });

  describe('Scenario 4: Concurrency & Double-Booking Prevention (AC 4)', () => {
    it('prevents double-booking when two concurrent requests attempt to book the exact same slot', async () => {
      const slot = createFixtureSlot(6, 2);
      const fixture = mockBookingFixture({
        id: 'first-booking-uuid',
        startTime: slot.startDate,
        endTime: slot.endDate,
      });

      // Simulate serialized row-lock: first request succeeds, second request hits BOOKING_CONFLICT
      let callCount = 0;
      vi.spyOn(bookingRepository, 'createBooking').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Add a tiny delay to simulate database transaction window
          await new Promise((resolve) => setTimeout(resolve, 10));
          return fixture;
        }
        throw new AppError('BOOKING_CONFLICT', 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác', 409);
      });

      const payload = {
        roomId: validRoomId,
        startTime: slot.startTime,
        endTime: slot.endTime,
      };

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${customerToken}`)
          .send(payload),
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${customer2Token}`)
          .send(payload),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const successRes = res1.status === 201 ? res1 : res2;
      const conflictRes = res1.status === 409 ? res1 : res2;

      expect(successRes.body.success).toBe(true);
      expect(successRes.body.data.id).toBe('first-booking-uuid');

      expect(conflictRes.body.success).toBe(false);
      expect(conflictRes.body.code).toBe('BOOKING_CONFLICT');
      expect(conflictRes.body.message).toContain('Khung giờ này đã có người đặt');
    });

    it('BookingRepository executes transactional row-lock and correctly rejects conflicting overlap', async () => {
      const repo = new BookingRepository();
      const slot = createFixtureSlot(7, 2);

      const mockTx = {
        booking: {
          findMany: vi.fn().mockResolvedValue([{ id: 'existing-conflicting-id' }]),
          create: vi.fn(),
        },
      };

      vi.mocked(lockRoomRow).mockResolvedValueOnce({
        id: validRoomId,
        name: 'Conference Room',
        pricePerHour: new Prisma.Decimal('100.00'),
        status: 'AVAILABLE',
      } as any);

      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
        return callback(mockTx);
      });

      await expect(
        repo.createBooking({
          roomId: validRoomId,
          bookingCode: 'CS-20261014-TEST',
          startDate: slot.startDate,
          endDate: slot.endDate,
          durationMinutes: 120,
          userId: customerSub,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'BOOKING_CONFLICT',
          statusCode: 409,
        }),
      );

      // Verify that lockRoomRow was called
      expect(lockRoomRow).toHaveBeenCalledWith(mockTx, validRoomId);

      // Verify overlap query parameters match canonical overlap formula
      expect(mockTx.booking.findMany).toHaveBeenCalledWith({
        where: {
          roomId: validRoomId,
          status: { in: [...BLOCKING_BOOKING_STATUSES] },
          startTime: { lt: slot.endDate },
          endTime: { gt: slot.startDate },
        },
        take: 1,
        select: { id: true },
      });

      // Verify booking creation was NOT invoked
      expect(mockTx.booking.create).not.toHaveBeenCalled();
    });

    it('BookingRepository allows creation when zero overlapping bookings are found', async () => {
      const repo = new BookingRepository();
      const slot = createFixtureSlot(8, 2);

      const mockCreatedRecord = {
        id: 'new-booking-uuid',
        bookingCode: 'CS-20261014-NEW1',
        roomId: validRoomId,
        room: { id: validRoomId, name: 'Conference Room' },
        startTime: slot.startDate,
        endTime: slot.endDate,
        totalAmount: new Prisma.Decimal('200.00'),
        note: null,
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      };

      const mockTx = {
        booking: {
          findMany: vi.fn().mockResolvedValue([]), // No conflicts found!
          create: vi.fn().mockResolvedValue(mockCreatedRecord),
        },
      };

      vi.mocked(lockRoomRow).mockResolvedValueOnce({
        id: validRoomId,
        name: 'Conference Room',
        pricePerHour: new Prisma.Decimal('100.00'),
        status: 'AVAILABLE',
      } as any);

      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await repo.createBooking({
        roomId: validRoomId,
        bookingCode: 'CS-20261014-NEW1',
        startDate: slot.startDate,
        endDate: slot.endDate,
        durationMinutes: 120,
        userId: customerSub,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('new-booking-uuid');
      expect(result.totalAmount).toBe('200.00');
      expect(mockTx.booking.create).toHaveBeenCalledTimes(1);
    });
  });
});
