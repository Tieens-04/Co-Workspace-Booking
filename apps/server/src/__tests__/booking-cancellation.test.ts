import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Role, BookingStatus, PaymentStatus } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { BookingService } from '../services/booking.service.js';
import { BookingResponseDto } from '../types/booking.type.js';
import {
  CANCELLATION_MIN_LEAD_MINUTES,
  validateCustomerCancellationTime,
} from '../utils/booking-time.util.js';
import { AppError } from '../utils/error.util.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const validBookingId = '11111111-1111-4111-8111-111111111111';
const otherBookingId = '22222222-2222-4222-8222-222222222222';
const customerSub = 'customer-uuid-1';
const customerToken = generateToken({ sub: customerSub, role: Role.CUSTOMER });
const adminToken = generateToken({ sub: 'admin-uuid-1', role: Role.ADMIN });

const mockBookingFixture = (override?: Partial<BookingResponseDto>): BookingResponseDto => {
  return {
    id: validBookingId,
    bookingCode: 'CS-20261025-ABCD',
    room: {
      id: 'room-uuid-1',
      name: 'Creative Studio',
    },
    startTime: new Date('2026-10-25T03:00:00.000Z'),
    endTime: new Date('2026-10-25T05:00:00.000Z'),
    totalAmount: '500000.00',
    note: 'Cần bảng trắng',
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
    paymentMethod: null,
    ...override,
  };
};

describe('Customer Booking Cancellation Unit Tests (PATCH /api/v1/bookings/:id/cancel)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & RBAC Controls', () => {
    it('returns 401 UNAUTHORIZED when no token is provided', async () => {
      const res = await request(app).patch(`/api/v1/bookings/${validBookingId}/cancel`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when role ADMIN attempts to call customer cancel endpoint', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 200 OK when CUSTOMER accesses with valid booking ID', async () => {
      const fixture = mockBookingFixture({ status: BookingStatus.CANCELLED });
      vi.spyOn(bookingRepository, 'cancelBooking').mockResolvedValue(fixture);

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(validBookingId);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(bookingRepository.cancelBooking).toHaveBeenCalledWith(
        customerSub,
        validBookingId,
        undefined,
      );
    });
  });

  describe('Validation - Params, Query, and Body', () => {
    it('returns 400 VALIDATION_ERROR when :id is not a valid UUID', async () => {
      const res = await request(app)
        .patch('/api/v1/bookings/not-a-valid-uuid/cancel')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'ID đặt phòng không đúng định dạng UUID',
          }),
        ]),
      );
    });

    it('returns 400 VALIDATION_ERROR when unexpected query parameters are provided', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}/cancel?unexpected=param`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when unexpected body fields are provided', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'CANCELLED', userId: 'hacker-id' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Business Rules & Error Handling Mapping', () => {
    it('returns 404 BOOKING_NOT_FOUND when booking does not exist or belongs to another user (IDOR)', async () => {
      vi.spyOn(bookingRepository, 'cancelBooking').mockRejectedValue(
        new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404),
      );

      const res = await request(app)
        .patch(`/api/v1/bookings/${otherBookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
      expect(res.body.message).toBe('Không tìm thấy đặt phòng');
    });

    it('returns 400 CANCELLATION_POLICY_VIOLATION when cancelling under 1 hour before start time (AC2)', async () => {
      vi.spyOn(bookingRepository, 'cancelBooking').mockRejectedValue(
        new AppError(
          'CANCELLATION_POLICY_VIOLATION',
          'Chỉ được hủy đặt phòng trước thời gian bắt đầu ít nhất 1 giờ',
          400,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('CANCELLATION_POLICY_VIOLATION');
      expect(res.body.message).toBe('Chỉ được hủy đặt phòng trước thời gian bắt đầu ít nhất 1 giờ');
    });

    it('returns 409 BOOKING_STATE_CONFLICT when booking is in non-cancellable status (COMPLETED/NO_SHOW)', async () => {
      vi.spyOn(bookingRepository, 'cancelBooking').mockRejectedValue(
        new AppError(
          'BOOKING_STATE_CONFLICT',
          'Chỉ có thể hủy đơn đặt phòng ở trạng thái đã xác nhận',
          409,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
      expect(res.body.message).toBe('Chỉ có thể hủy đơn đặt phòng ở trạng thái đã xác nhận');
    });

    it('returns 200 OK with already CANCELLED record idempotently', async () => {
      const cancelledFixture = mockBookingFixture({ status: BookingStatus.CANCELLED });
      vi.spyOn(bookingRepository, 'cancelBooking').mockResolvedValue(cancelledFixture);

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  describe('Service & Time Boundary Unit Rules (1-Hour Policy)', () => {
    it('verifies CANCELLATION_MIN_LEAD_MINUTES is 60 (1 hour per Human Clarifications)', () => {
      expect(CANCELLATION_MIN_LEAD_MINUTES).toBe(60);
    });

    it('accepts cancellation when time until start is exactly 60 minutes (AC1 boundary)', () => {
      const fixedNow = new Date('2026-10-25T08:00:00.000Z');
      const startTime = new Date('2026-10-25T09:00:00.000Z'); // exactly 60 minutes
      expect(() => validateCustomerCancellationTime(startTime, fixedNow)).not.toThrow();
    });

    it('accepts cancellation when time until start is greater than 60 minutes', () => {
      const fixedNow = new Date('2026-10-25T08:00:00.000Z');
      const startTime = new Date('2026-10-25T09:00:00.001Z'); // 60m + 1ms
      expect(() => validateCustomerCancellationTime(startTime, fixedNow)).not.toThrow();

      const futureStart = new Date('2026-10-25T11:00:00.000Z'); // 3 hours
      expect(() => validateCustomerCancellationTime(futureStart, fixedNow)).not.toThrow();
    });

    it('rejects cancellation when time until start is 59 minutes and 59 seconds (AC2 boundary)', () => {
      const fixedNow = new Date('2026-10-25T08:00:00.000Z');
      const startTime = new Date('2026-10-25T08:59:59.000Z'); // 59m 59s
      expect(() => validateCustomerCancellationTime(startTime, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'CANCELLATION_POLICY_VIOLATION',
          statusCode: 400,
          message: 'Chỉ được hủy đặt phòng trước thời gian bắt đầu ít nhất 1 giờ',
        }),
      );
    });

    it('rejects cancellation when time until start is 30 minutes', () => {
      const fixedNow = new Date('2026-10-25T08:00:00.000Z');
      const startTime = new Date('2026-10-25T08:30:00.000Z'); // 30 mins
      expect(() => validateCustomerCancellationTime(startTime, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'CANCELLATION_POLICY_VIOLATION',
          statusCode: 400,
        }),
      );
    });

    it('rejects cancellation when booking start time has already passed', () => {
      const fixedNow = new Date('2026-10-25T08:00:00.000Z');
      const pastStartTime = new Date('2026-10-25T07:30:00.000Z'); // 30m in past
      expect(() => validateCustomerCancellationTime(pastStartTime, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'CANCELLATION_POLICY_VIOLATION',
          statusCode: 400,
        }),
      );
    });

    it('BookingService.cancelBooking delegates to repository with now timestamp', async () => {
      const mockRepo = {
        createBooking: vi.fn(),
        findManyAndCountForUser: vi.fn(),
        findByIdForUser: vi.fn(),
        cancelBooking: vi.fn().mockResolvedValue(mockBookingFixture({ status: BookingStatus.CANCELLED })),
      };
      const service = new BookingService(mockRepo);
      const fixedNow = new Date('2026-10-25T08:00:00.000Z');

      const result = await service.cancelBooking(customerSub, validBookingId, fixedNow);

      expect(mockRepo.cancelBooking).toHaveBeenCalledWith(customerSub, validBookingId, fixedNow);
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('BookingService.cancelBooking delegates to repository with clock function', async () => {
      const mockRepo = {
        createBooking: vi.fn(),
        findManyAndCountForUser: vi.fn(),
        findByIdForUser: vi.fn(),
        cancelBooking: vi.fn().mockResolvedValue(mockBookingFixture({ status: BookingStatus.CANCELLED })),
      };
      const service = new BookingService(mockRepo);
      const clockFn = () => new Date('2026-10-25T08:00:00.000Z');

      const result = await service.cancelBooking(customerSub, validBookingId, clockFn);

      expect(mockRepo.cancelBooking).toHaveBeenCalledWith(customerSub, validBookingId, clockFn);
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('BookingService.cancelBooking delegates to repository with undefined clock when called without clock', async () => {
      const mockRepo = {
        createBooking: vi.fn(),
        findManyAndCountForUser: vi.fn(),
        findByIdForUser: vi.fn(),
        cancelBooking: vi.fn().mockResolvedValue(mockBookingFixture({ status: BookingStatus.CANCELLED })),
      };
      const service = new BookingService(mockRepo);

      const result = await service.cancelBooking(customerSub, validBookingId);

      expect(mockRepo.cancelBooking).toHaveBeenCalledWith(customerSub, validBookingId, undefined);
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });
  });
});
