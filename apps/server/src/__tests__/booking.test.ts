import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Prisma, Role, BookingStatus, PaymentStatus } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { bookingService } from '../services/booking.service.js';
import { BookingResponseDto } from '../types/booking.type.js';
import { AppError } from '../utils/error.util.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const validRoomId = '11111111-1111-4111-8111-111111111111';
const customerSub = 'customer-uuid-1';
const customerToken = generateToken({ sub: customerSub, role: Role.CUSTOMER });
const adminToken = generateToken({ sub: 'admin-uuid-1', role: Role.ADMIN });

const getFutureSlot = (hoursAhead = 2, durationHours = 2) => {
  const base = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  base.setUTCMinutes(0, 0, 0);
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
  const slot = getFutureSlot();
  return {
    id: 'booking-uuid-1',
    bookingCode: 'CS-20260921-ABCD',
    room: {
      id: validRoomId,
      name: 'Creative Studio',
    },
    startTime: slot.startDate,
    endTime: slot.endDate,
    totalAmount: '500000.00',
    note: 'Cần bảng trắng',
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
    paymentMethod: null,
    ...override,
  };
};

describe('Booking API & Service Unit Tests (/api/v1/bookings)', () => {
  beforeEach(() => {
    vi.spyOn(bookingRepository, 'createBooking').mockResolvedValue(mockBookingFixture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & RBAC Controls', () => {
    it('returns 401 UNAUTHORIZED when no token is provided to POST /api/v1/bookings', async () => {
      const slot = getFutureSlot();
      const res = await request(app).post('/api/v1/bookings').send({
        roomId: validRoomId,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when ADMIN accesses POST /api/v1/bookings', async () => {
      const slot = getFutureSlot();
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 201 when CUSTOMER accesses POST /api/v1/bookings with valid payload', async () => {
      const slot = getFutureSlot();
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          note: 'Cần bảng trắng',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('booking-uuid-1');
      expect(res.body.data.bookingCode).toBe('CS-20260921-ABCD');
      expect(res.body.data.totalAmount).toBe('500000.00');
    });
  });

  describe('Input Validation & Mass Assignment Protection', () => {
    it('rejects missing or invalid roomId format', async () => {
      const slot = getFutureSlot();
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: 'not-a-uuid',
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid ISO datetime strings', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: 'invalid-date',
          endTime: '2026-09-21T10:00:00Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects client-supplied sensitive/privileged fields (mass assignment)', async () => {
      const slot = getFutureSlot();
      const maliciousFields = [
        { userId: 'malicious-user-id' },
        { totalAmount: '1.00' },
        { status: 'COMPLETED' },
        { paymentStatus: 'PAID' },
        { bookingCode: 'CS-HACK-0000' },
        { pricePerHour: '10.00' },
        { role: 'ADMIN' },
      ];

      for (const field of maliciousFields) {
        const res = await request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            roomId: validRoomId,
            startTime: slot.startTime,
            endTime: slot.endTime,
            ...field,
          });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('normalizes empty note to null and preserves valid note', async () => {
      const slot = getFutureSlot();
      await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          note: '   ',
        });

      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({ note: null }),
      );

      await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          note: '  Họp dự án  ',
        });

      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({ note: 'Họp dự án' }),
      );
    });

    it('accepts note with exactly 500 characters and trims surrounding whitespace', async () => {
      const slot = getFutureSlot();
      const note500 = 'x'.repeat(500);
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          note: `  ${note500}  `,
        });

      expect(res.status).toBe(201);
      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({ note: note500 }),
      );
    });

    it('accepts note with Vietnamese multibyte characters up to 500 characters', async () => {
      const slot = getFutureSlot();
      const viNote = 'Cần chuẩn bị máy chiếu, bảng viết và 10 ghế phụ cho buổi họp nhóm.'.padEnd(
        500,
        '✨',
      );
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          note: viNote,
        });

      expect(res.status).toBe(201);
      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({ note: viNote }),
      );
    });

    it('rejects note exceeding 500 characters with 400 VALIDATION_ERROR', async () => {
      const slot = getFutureSlot();
      const note501 = 'a'.repeat(501);
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          note: note501,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'note',
            message: 'Ghi chú không được vượt quá 500 ký tự',
          }),
        ]),
      );
    });
  });

  describe('Service Business Time Rules & Identity Enforcement', () => {
    it('always passes verified JWT sub as userId to repository, never client input', async () => {
      const slot = getFutureSlot();
      await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({ userId: customerSub }),
      );
    });

    it('returns 400 INVALID_SLOT when slot is not aligned to 30 minutes', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: '2026-10-01T09:15:00Z',
          endTime: '2026-10-01T11:15:00Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SLOT');
    });

    it('returns 400 MIN_DURATION when duration is less than 1 hour', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: '2026-10-01T09:00:00Z',
          endTime: '2026-10-01T09:30:00Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MIN_DURATION');
    });

    it('returns 400 MAX_DURATION when duration exceeds 4 hours', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: '2026-10-01T09:00:00Z',
          endTime: '2026-10-01T13:30:00Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MAX_DURATION');
    });

    it('returns 400 PAST_TIME when start time is in the past', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: '2020-01-01T09:00:00Z',
          endTime: '2020-01-01T11:00:00Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAST_TIME');
    });

    it('returns 404 ROOM_NOT_FOUND when repository throws ROOM_NOT_FOUND', async () => {
      vi.mocked(bookingRepository.createBooking).mockRejectedValueOnce(
        new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404),
      );

      const slot = getFutureSlot();
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ROOM_NOT_FOUND');
    });

    it('returns 409 ROOM_NOT_AVAILABLE when room is in MAINTENANCE', async () => {
      vi.mocked(bookingRepository.createBooking).mockRejectedValueOnce(
        new AppError('ROOM_NOT_AVAILABLE', 'Phòng đang bảo trì', 409),
      );

      const slot = getFutureSlot();
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
    });

    it('returns 409 BOOKING_CONFLICT when slot overlaps an existing booking', async () => {
      vi.mocked(bookingRepository.createBooking).mockRejectedValueOnce(
        new AppError('BOOKING_CONFLICT', 'Khung giờ này đã có người đặt', 409),
      );

      const slot = getFutureSlot();
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
  });

  describe('Booking Code Retry Loop & Error Sanitization', () => {
    it('retries code generation on P2002 collision and succeeds if subsequent attempt succeeds', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on booking_code',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['booking_code'] },
        },
      );

      vi.mocked(bookingRepository.createBooking)
        .mockRejectedValueOnce(p2002Error)
        .mockResolvedValueOnce(mockBookingFixture());

      const slot = getFutureSlot();
      const result = await bookingService.createBooking(customerSub, {
        roomId: validRoomId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        note: null,
      });

      expect(result).toBeDefined();
      expect(bookingRepository.createBooking).toHaveBeenCalledTimes(2);
    });

    it('does not retry P2002 if the collision target is not booking_code and rethrows immediately', async () => {
      const otherP2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on other column',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['other_key'] },
        },
      );

      vi.mocked(bookingRepository.createBooking).mockRejectedValueOnce(otherP2002Error);

      const slot = getFutureSlot();
      await expect(
        bookingService.createBooking(customerSub, {
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          note: null,
        }),
      ).rejects.toThrow(otherP2002Error);

      expect(bookingRepository.createBooking).toHaveBeenCalledTimes(1);
    });

    it('throws 409 BOOKING_CODE_CONFLICT if all 5 code attempts collide, and HTTP response contains no raw Prisma details', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on booking_code',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['booking_code'], modelName: 'Booking' },
        },
      );

      vi.mocked(bookingRepository.createBooking).mockRejectedValue(p2002Error);

      const slot = getFutureSlot();
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          note: null,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CODE_CONFLICT');
      expect(res.body.message).toBe('Không thể tạo mã đặt phòng duy nhất, vui lòng thử lại');
      expect(res.body.details).toBeUndefined();
      expect(bookingRepository.createBooking).toHaveBeenCalledTimes(5);
    });
  });
});
