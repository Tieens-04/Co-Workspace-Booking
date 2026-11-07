import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Role, BookingStatus, PaymentStatus } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { BookingResponseDto } from '../types/booking.type.js';
import { AppError } from '../utils/error.util.js';
import {
  validateCustomerRescheduleTime,
  RESCHEDULE_MIN_LEAD_MINUTES,
} from '../utils/booking-time.util.js';
import { emailOutboxService } from '../services/email-outbox.service.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const validBookingId = '11111111-1111-4111-8111-111111111111';
const validRoomId = '22222222-2222-4222-8222-222222222222';
const customerSub = 'customer-uuid-1';
const customerToken = generateToken({ sub: customerSub, role: Role.CUSTOMER });
const adminToken = generateToken({ sub: 'admin-uuid-1', role: Role.ADMIN });

const mockBookingFixture = (override?: Partial<BookingResponseDto>): BookingResponseDto => {
  return {
    id: validBookingId,
    bookingCode: 'CS-20261108-ABCD',
    room: {
      id: validRoomId,
      name: 'Creative Studio',
    },
    startTime: new Date('2026-11-08T03:00:00.000Z'), // 10:00 VN
    endTime: new Date('2026-11-08T05:00:00.000Z'),   // 12:00 VN
    totalAmount: '500000.00',
    note: 'Cần bảng trắng',
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
    paymentMethod: null,
    checkedInAt: null,
    attendanceTrackingEnabled: true,
    ...override,
  };
};

describe('Customer Booking Reschedule Unit Tests (PATCH /api/v1/bookings/:id)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & RBAC Controls', () => {
    it('returns 401 UNAUTHORIZED when no token is provided', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
        });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when ADMIN accesses customer reschedule route', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('Input Validation & Mass Assignment Protection', () => {
    it('returns 400 when :id is not a valid UUID', async () => {
      const res = await request(app)
        .patch('/api/v1/bookings/invalid-uuid')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when startTime is missing or not ISO 8601', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          endTime: '2026-11-08T06:00:00.000Z',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when endTime is missing or not ISO 8601', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: 'not-a-date',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when roomId is provided but not a valid UUID', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
          roomId: 'not-a-uuid',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unexpected query parameters with 400 validation error (F4 regression)', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}?unexpectedParam=123`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown fields in body with 400 strict mode', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
          status: 'CONFIRMED',
          totalAmount: '1000',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects note longer than 500 characters', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
          note: 'a'.repeat(501),
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Business Rules & Policy Enforcement', () => {
    it('returns 400 RESCHEDULE_POLICY_VIOLATION when current booking starts in < 1h', async () => {
      vi.spyOn(bookingRepository, 'rescheduleBooking').mockRejectedValue(
        new AppError(
          'RESCHEDULE_POLICY_VIOLATION',
          'Chỉ được đổi lịch đặt phòng trước thời gian bắt đầu ít nhất 1 giờ',
          400,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('RESCHEDULE_POLICY_VIOLATION');
      expect(res.body.message).toContain('trước thời gian bắt đầu ít nhất 1 giờ');
    });

    it('returns 409 BOOKING_STATE_CONFLICT when booking is not in CONFIRMED status', async () => {
      vi.spyOn(bookingRepository, 'rescheduleBooking').mockRejectedValue(
        new AppError(
          'BOOKING_STATE_CONFLICT',
          'Chỉ có thể đổi lịch đơn đặt phòng ở trạng thái đã xác nhận',
          409,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    });

    it('returns 409 PAID_BOOKING_CANNOT_RESCHEDULE when booking has already been PAID', async () => {
      vi.spyOn(bookingRepository, 'rescheduleBooking').mockRejectedValue(
        new AppError(
          'PAID_BOOKING_CANNOT_RESCHEDULE',
          'Đơn đặt phòng đã thanh toán không thể tự đổi lịch trực tuyến. Vui lòng liên hệ quầy lễ tân để được hỗ trợ.',
          409,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PAID_BOOKING_CANNOT_RESCHEDULE');
      expect(res.body.message).toContain('đã thanh toán');
    });

    it('returns 404 BOOKING_NOT_FOUND when booking does not exist or belongs to another user (IDOR)', async () => {
      vi.spyOn(bookingRepository, 'rescheduleBooking').mockRejectedValue(
        new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404),
      );

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
        });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
    });

    it('returns 409 ROOM_NOT_AVAILABLE when target room is in MAINTENANCE', async () => {
      vi.spyOn(bookingRepository, 'rescheduleBooking').mockRejectedValue(
        new AppError(
          'ROOM_NOT_AVAILABLE',
          'Phòng đang trong trạng thái bảo trì, không thể đặt phòng',
          409,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
    });

    it('returns 409 BOOKING_CONFLICT when new time slot overlaps with another booking', async () => {
      vi.spyOn(bookingRepository, 'rescheduleBooking').mockRejectedValue(
        new AppError(
          'BOOKING_CONFLICT',
          'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác',
          409,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T04:00:00.000Z',
          endTime: '2026-11-08T06:00:00.000Z',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
    });
  });

  describe('Success & Side Effects', () => {
    it('successfully reschedules booking and returns 200 with updated details and kicks email outbox', async () => {
      const updatedFixture = mockBookingFixture({
        startTime: new Date('2026-11-08T06:00:00.000Z'),
        endTime: new Date('2026-11-08T08:00:00.000Z'),
        totalAmount: '600000.00',
      });
      vi.spyOn(bookingRepository, 'rescheduleBooking').mockResolvedValue(updatedFixture);
      const kickSpy = vi.spyOn(emailOutboxService, 'kick').mockReturnValue();

      const res = await request(app)
        .patch(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-08T06:00:00.000Z',
          endTime: '2026-11-08T08:00:00.000Z',
          roomId: validRoomId,
          note: 'Đổi sang giờ chiều',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đổi lịch đặt phòng thành công');
      expect(res.body.data.id).toBe(validBookingId);
      expect(res.body.data.totalAmount).toBe('600000.00');

      expect(bookingRepository.rescheduleBooking).toHaveBeenCalledWith(
        customerSub,
        validBookingId,
        {
          startTime: '2026-11-08T06:00:00.000Z',
          endTime: '2026-11-08T08:00:00.000Z',
          roomId: validRoomId,
          note: 'Đổi sang giờ chiều',
        },
        undefined,
      );
      expect(kickSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Time Validation Helper: validateCustomerRescheduleTime', () => {
    it('uses dedicated RESCHEDULE_MIN_LEAD_MINUTES constant = 60 (F7 regression)', () => {
      expect(RESCHEDULE_MIN_LEAD_MINUTES).toBe(60);
    });
    it('accepts reschedule when now is >= 60 minutes before start', () => {
      const start = new Date('2026-11-08T10:00:00.000Z');
      const exactly1HourBefore = new Date('2026-11-08T09:00:00.000Z');
      expect(() => validateCustomerRescheduleTime(start, exactly1HourBefore)).not.toThrow();

      const twoHoursBefore = new Date('2026-11-08T08:00:00.000Z');
      expect(() => validateCustomerRescheduleTime(start, twoHoursBefore)).not.toThrow();
    });

    it('rejects reschedule when now is < 60 minutes before start with 400', () => {
      const start = new Date('2026-11-08T10:00:00.000Z');
      const fiftyNineMinsBefore = new Date('2026-11-08T09:01:00.000Z');
      expect(() => validateCustomerRescheduleTime(start, fiftyNineMinsBefore)).toThrowError(
        expect.objectContaining({
          code: 'RESCHEDULE_POLICY_VIOLATION',
          statusCode: 400,
        }),
      );
    });
  });
});
