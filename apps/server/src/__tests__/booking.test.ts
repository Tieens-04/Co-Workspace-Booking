import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Prisma, Role, BookingStatus, PaymentStatus } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { bookingService, BookingService } from '../services/booking.service.js';
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
    vi.useRealTimers();
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
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.paymentStatus).toBe('UNPAID');
      expect(res.body.data.paymentMethod).toBeNull();
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
        { paymentMethod: 'CASH' },
        { durationMinutes: 120 },
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

    it('returns 400 INVALID_SLOT with clear message when slot is not aligned to 30 minutes', async () => {
      const slot = getFutureSlot(2, 2);
      const unalignedStart = new Date(slot.startDate.getTime() + 15 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: unalignedStart,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_SLOT');
      expect(res.body.message).toBe(
        'Thời gian bắt đầu và kết thúc phải đúng mốc 30 phút (ví dụ: 09:00, 09:30) với giây bằng 0',
      );
      expect(bookingRepository.createBooking).not.toHaveBeenCalled();
    });

    it('returns 400 MIN_DURATION with clear message when duration is less than 1 hour', async () => {
      const slot = getFutureSlot(2, 0.5); // 30 minutes duration

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('MIN_DURATION');
      expect(res.body.message).toBe('Thời lượng đặt phòng tối thiểu là 1 giờ (60 phút)');
      expect(bookingRepository.createBooking).not.toHaveBeenCalled();
    });

    it('returns 400 MAX_DURATION with clear message when duration exceeds 8 hours (480 minutes)', async () => {
      const slot = getFutureSlot(2, 8.5); // 8.5 hours duration

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('MAX_DURATION');
      expect(res.body.message).toBe('Thời lượng đặt phòng tối đa là 8 giờ (480 phút)');
      expect(bookingRepository.createBooking).not.toHaveBeenCalled();
    });

    it('returns 400 PAST_TIME with clear message when start time is in the past', async () => {
      const base = new Date(Date.now() - 4 * 60 * 60 * 1000);
      base.setUTCMinutes(0, 0, 0);
      const pastStart = base.toISOString();
      const pastEnd = new Date(base.getTime() + 2 * 60 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: pastStart,
          endTime: pastEnd,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PAST_TIME');
      expect(res.body.message).toBe('Thời gian bắt đầu không được ở trong quá khứ');
      expect(bookingRepository.createBooking).not.toHaveBeenCalled();
    });

    it('returns 400 ADVANCE_NOTICE with clear message when booking is made less than 30 minutes before start', async () => {
      const slot = getFutureSlot(2, 1);
      vi.spyOn(bookingService, 'createBooking').mockImplementationOnce((userId, input) => {
        const simulatedNow = new Date(new Date(input.startTime).getTime() - 20 * 60 * 1000);
        return BookingService.prototype.createBooking.call(
          bookingService,
          userId,
          input,
          simulatedNow,
        );
      });

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ADVANCE_NOTICE');
      expect(res.body.message).toBe('Phải đặt phòng trước thời gian bắt đầu ít nhất 30 phút');
      expect(bookingRepository.createBooking).not.toHaveBeenCalled();
    });

    it('successfully accepts booking of 4.5 hours (previously rejected by old 4-hour limit)', async () => {
      const slot = getFutureSlot(2, 4.5);

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
      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMinutes: 270,
        }),
      );
    });

    it('successfully accepts booking of exactly 8 hours (maximum allowed duration)', async () => {
      const slot = getFutureSlot(2, 8);

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
      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMinutes: 480,
        }),
      );
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
        .mockResolvedValueOnce(mockBookingFixture({ bookingCode: 'CS-20260921-RETR' }));

      const slot = getFutureSlot();
      const result = await bookingService.createBooking(customerSub, {
        roomId: validRoomId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        note: null,
      });

      expect(result).toBeDefined();
      expect(result.bookingCode).toBe('CS-20260921-RETR');
      expect(bookingRepository.createBooking).toHaveBeenCalledTimes(2);
    });

    it('retries code generation when P2002 meta.target is a MySQL index name string (bookings_booking_code_key)', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on bookings_booking_code_key',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: 'bookings_booking_code_key' },
        },
      );

      vi.mocked(bookingRepository.createBooking)
        .mockRejectedValueOnce(p2002Error)
        .mockResolvedValueOnce(mockBookingFixture({ bookingCode: 'CS-20260921-SUCC' }));

      const slot = getFutureSlot();
      const result = await bookingService.createBooking(customerSub, {
        roomId: validRoomId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        note: null,
      });

      expect(result).toBeDefined();
      expect(result.bookingCode).toBe('CS-20260921-SUCC');
      expect(bookingRepository.createBooking).toHaveBeenCalledTimes(2);
    });

    it('derives booking code date segment from booking start time in Asia/Ho_Chi_Minh, not request submission time', async () => {
      // Request submitted on 2026-09-20T10:00:00Z (2026-09-20 17:00 VN)
      const simulatedNow = new Date('2026-09-20T10:00:00.000Z');
      // Booking starts on 2026-09-21T02:00:00Z (2026-09-21 09:00 VN)
      const startTime = '2026-09-21T02:00:00.000Z';
      const endTime = '2026-09-21T04:00:00.000Z';

      await bookingService.createBooking(
        customerSub,
        {
          roomId: validRoomId,
          startTime,
          endTime,
          note: null,
        },
        simulatedNow,
      );

      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingCode: expect.stringMatching(/^CS-20260921-[0-9A-Z]{4}$/),
        }),
      );
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
