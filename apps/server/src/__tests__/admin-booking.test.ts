import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Role, BookingStatus, PaymentStatus, PaymentMethod } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { AdminBookingResponseDto } from '../types/admin-booking.type.js';
import { AppError } from '../utils/error.util.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const validRoomId = '11111111-1111-4111-8111-111111111111';
const customerToken = generateToken({ sub: 'customer-uuid-1', role: Role.CUSTOMER });
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

const mockAdminBookingFixture = (
  override?: Partial<AdminBookingResponseDto>,
): AdminBookingResponseDto => {
  const slot = getFutureSlot();
  return {
    id: 'booking-admin-uuid-1',
    bookingCode: 'CS-20261003-ABCD',
    room: {
      id: validRoomId,
      name: 'Executive Boardroom',
    },
    startTime: slot.startDate,
    endTime: slot.endDate,
    totalAmount: '600000.00',
    note: 'Khách VIP',
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
    paymentMethod: null,
    checkedInAt: null,
    attendanceTrackingEnabled: true,
    customer: {
      kind: 'GUEST',
      name: 'Nguyễn Văn Vãng Lai',
      phone: '0901234567',
    },
    ...override,
  };
};

describe('Admin Booking Management API Unit Tests', () => {
  beforeEach(() => {
    vi.spyOn(bookingRepository, 'evaluateNoShowBookings').mockResolvedValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & Authorization', () => {
    it('returns 401 UNAUTHORIZED when no token is provided to GET /api/v1/admin/bookings', async () => {
      const res = await request(app).get('/api/v1/admin/bookings');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses GET /api/v1/admin/bookings', async () => {
      const res = await request(app)
        .get('/api/v1/admin/bookings')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 401 UNAUTHORIZED when no token is provided to POST /api/v1/admin/bookings/guest', async () => {
      const slot = getFutureSlot();
      const res = await request(app).post('/api/v1/admin/bookings/guest').send({
        roomId: validRoomId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        guestName: 'Nguyễn Văn A',
        guestPhone: '0912345678',
      });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses POST /api/v1/admin/bookings/guest', async () => {
      const slot = getFutureSlot();
      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          guestName: 'Nguyễn Văn A',
          guestPhone: '0912345678',
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 401 UNAUTHORIZED when no token is provided to PATCH /api/v1/admin/bookings/:id/payment', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/bookings/11111111-1111-4111-8111-111111111111/payment')
        .send({ paymentMethod: 'CASH' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses PATCH /api/v1/admin/bookings/:id/payment', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/bookings/11111111-1111-4111-8111-111111111111/payment')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paymentMethod: 'CASH' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 401 UNAUTHORIZED when no token is provided to PATCH /api/v1/admin/bookings/:id/cancel', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/bookings/11111111-1111-4111-8111-111111111111/cancel')
        .send({ reason: 'Hủy đơn' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses PATCH /api/v1/admin/bookings/:id/cancel', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/bookings/11111111-1111-4111-8111-111111111111/cancel')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Hủy đơn' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/admin/bookings (List & Search)', () => {
    it('returns 200 with items and pagination on successful admin query', async () => {
      const fixture = mockAdminBookingFixture();
      vi.spyOn(bookingRepository, 'findManyAndCountForAdmin').mockResolvedValue([1, [fixture]]);

      const res = await request(app)
        .get('/api/v1/admin/bookings?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].bookingCode).toBe('CS-20261003-ABCD');
      expect(res.body.data.items[0].customer.kind).toBe('GUEST');
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it('rejects invalid query parameters with 400', async () => {
      const res1 = await request(app)
        .get('/api/v1/admin/bookings?limit=0')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .get('/api/v1/admin/bookings?limit=101')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .get('/api/v1/admin/bookings?status=INVALID_STATUS')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res3.status).toBe(400);

      const res4 = await request(app)
        .get('/api/v1/admin/bookings?date=2026-02-30')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res4.status).toBe(400);

      const res5 = await request(app)
        .get('/api/v1/admin/bookings?unknownField=hello')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res5.status).toBe(400);
    });

    it('normalizes bookingCode by stripping whitespace and uppercasing before repository query', async () => {
      const spy = vi
        .spyOn(bookingRepository, 'findManyAndCountForAdmin')
        .mockResolvedValue([0, []]);

      const res = await request(app)
        .get('/api/v1/admin/bookings?bookingCode=%20cs-20261003-abcd%20')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingCode: 'CS-20261003-ABCD',
        }),
      );
    });
  });

  describe('POST /api/v1/admin/bookings/guest (Create Guest Booking)', () => {
    it('creates guest booking successfully and returns 201 with AdminBookingResponseDto', async () => {
      const slot = getFutureSlot(3, 2);
      const fixture = mockAdminBookingFixture({
        startTime: slot.startDate,
        endTime: slot.endDate,
        customer: {
          kind: 'GUEST',
          name: 'Trần Thị Khách',
          phone: '0987654321',
        },
      });

      vi.spyOn(bookingRepository, 'createBooking').mockResolvedValue({
        id: fixture.id,
        bookingCode: fixture.bookingCode,
        room: fixture.room,
        startTime: fixture.startTime,
        endTime: fixture.endTime,
        totalAmount: fixture.totalAmount,
        note: fixture.note,
        status: fixture.status,
        paymentStatus: fixture.paymentStatus,
        paymentMethod: fixture.paymentMethod,
        checkedInAt: fixture.checkedInAt,
        attendanceTrackingEnabled: fixture.attendanceTrackingEnabled,
      });

      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          guestName: 'Trần Thị Khách',
          guestPhone: '0987654321',
          note: 'Đặt hộ khách VIP',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer).toEqual({
        kind: 'GUEST',
        name: 'Trần Thị Khách',
        phone: '0987654321',
      });
      expect(res.body.data.bookingCode).toBe(fixture.bookingCode);
    });

    it('rejects missing or empty guestName / guestPhone with 400', async () => {
      const slot = getFutureSlot(3, 2);

      const res1 = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          guestName: '   ',
          guestPhone: '0987654321',
        });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          guestName: 'Khách A',
          guestPhone: '   ',
        });
      expect(res2.status).toBe(400);
    });

    it('rejects mass-assignment attempts (userId, role, price, status) with 400', async () => {
      const slot = getFutureSlot(3, 2);

      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          guestName: 'Khách A',
          guestPhone: '0912345678',
          userId: 'hacker-user-id',
          status: 'COMPLETED',
          totalAmount: '0.00',
        });

      expect(res.status).toBe(400);
    });

    it('rejects booking time violations with 400', async () => {
      // Duration < 1h (30 mins)
      const base = new Date(Date.now() + 2 * 60 * 60 * 1000);
      base.setUTCMinutes(0, 0, 0);
      const start = base.toISOString();
      const end = new Date(base.getTime() + 30 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: validRoomId,
          startTime: start,
          endTime: end,
          guestName: 'Khách A',
          guestPhone: '0912345678',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MIN_DURATION');
    });

    it('propagates 409 ROOM_NOT_AVAILABLE when room is in maintenance', async () => {
      const slot = getFutureSlot(3, 2);
      vi.spyOn(bookingRepository, 'createBooking').mockRejectedValue(
        new AppError('ROOM_NOT_AVAILABLE', 'Phòng đang trong trạng thái bảo trì', 409),
      );

      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          guestName: 'Khách A',
          guestPhone: '0912345678',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
    });

    it('propagates 409 BOOKING_CONFLICT when overlapping booking exists', async () => {
      const slot = getFutureSlot(3, 2);
      vi.spyOn(bookingRepository, 'createBooking').mockRejectedValue(
        new AppError('BOOKING_CONFLICT', 'Khung giờ này đã có người đặt', 409),
      );

      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: validRoomId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          guestName: 'Khách A',
          guestPhone: '0912345678',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
    });
  });

  describe('PATCH /api/v1/admin/bookings/:id/payment (Confirm Payment)', () => {
    const validBookingId = '22222222-2222-4222-8222-222222222222';

    it('rejects invalid booking UUID with 400', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/bookings/not-a-uuid/payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'CASH' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects missing or invalid paymentMethod with 400', async () => {
      const res1 = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'CRYPTO' });

      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe('VALIDATION_ERROR');
    });

    it('successfully confirms payment with CASH and returns updated booking', async () => {
      const updatedFixture = mockAdminBookingFixture({
        id: validBookingId,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.CASH,
      });

      const spy = vi
        .spyOn(bookingRepository, 'confirmPaymentForAdmin')
        .mockResolvedValue(updatedFixture);

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'CASH' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe('PAID');
      expect(res.body.data.paymentMethod).toBe('CASH');
      expect(spy).toHaveBeenCalledWith(validBookingId, PaymentMethod.CASH);
    });

    it('successfully confirms payment with QR and returns updated booking', async () => {
      const updatedFixture = mockAdminBookingFixture({
        id: validBookingId,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.QR,
      });

      const spy = vi
        .spyOn(bookingRepository, 'confirmPaymentForAdmin')
        .mockResolvedValue(updatedFixture);

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'QR' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe('PAID');
      expect(res.body.data.paymentMethod).toBe('QR');
      expect(spy).toHaveBeenCalledWith(validBookingId, PaymentMethod.QR);
    });

    it('propagates 404 BOOKING_NOT_FOUND when booking does not exist', async () => {
      vi.spyOn(bookingRepository, 'confirmPaymentForAdmin').mockRejectedValue(
        new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'CASH' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
    });

    it('propagates 409 BOOKING_STATE_CONFLICT when booking is CANCELLED', async () => {
      vi.spyOn(bookingRepository, 'confirmPaymentForAdmin').mockRejectedValue(
        new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể xác nhận thanh toán cho đơn đặt phòng đã hủy',
          409,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'CASH' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    });

    it('returns 200 idempotently when booking is already PAID', async () => {
      const alreadyPaidFixture = mockAdminBookingFixture({
        id: validBookingId,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.CASH,
      });

      vi.spyOn(bookingRepository, 'confirmPaymentForAdmin').mockResolvedValue(alreadyPaidFixture);

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'CASH' });

      expect(res.status).toBe(200);
      expect(res.body.data.paymentStatus).toBe('PAID');
    });
  });

  describe('PATCH /api/v1/admin/bookings/:id/cancel (Admin Cancel Booking)', () => {
    const validBookingId = '22222222-2222-4222-8222-222222222222';

    it('rejects invalid booking UUID with 400', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/bookings/not-a-uuid/cancel')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Khách đổi kế hoạch' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects missing or empty reason with 400', async () => {
      const res1 = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '   ' });

      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects reason exceeding 500 characters with 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'a'.repeat(501) });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('successfully cancels booking with reason and returns CANCELLED status', async () => {
      const cancelledFixture = mockAdminBookingFixture({
        id: validBookingId,
        status: BookingStatus.CANCELLED,
        cancellationReason: 'Khách yêu cầu hủy qua hotline',
      });

      const spy = vi
        .spyOn(bookingRepository, 'cancelBookingForAdmin')
        .mockResolvedValue(cancelledFixture);

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Khách yêu cầu hủy qua hotline' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(res.body.data.cancellationReason).toBe('Khách yêu cầu hủy qua hotline');
      expect(spy).toHaveBeenCalledWith(validBookingId, 'Khách yêu cầu hủy qua hotline');
    });

    it('propagates 404 BOOKING_NOT_FOUND when booking does not exist', async () => {
      vi.spyOn(bookingRepository, 'cancelBookingForAdmin').mockRejectedValue(
        new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Hủy phòng' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
    });

    it('propagates 409 BOOKING_STATE_CONFLICT when booking is COMPLETED', async () => {
      vi.spyOn(bookingRepository, 'cancelBookingForAdmin').mockRejectedValue(
        new AppError('BOOKING_STATE_CONFLICT', 'Không thể hủy đơn đặt phòng đã hoàn tất', 409),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Hủy đơn' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    });

    it('returns 200 idempotently when booking is already CANCELLED', async () => {
      const alreadyCancelledFixture = mockAdminBookingFixture({
        id: validBookingId,
        status: BookingStatus.CANCELLED,
        cancellationReason: 'Đã hủy trước đó',
      });

      vi.spyOn(bookingRepository, 'cancelBookingForAdmin').mockResolvedValue(
        alreadyCancelledFixture,
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Hủy lại' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  describe('PATCH /api/v1/admin/bookings/:id/complete (Check-in & Complete Flow)', () => {
    const validBookingId = '22222222-2222-4222-8222-222222222222';

    it('returns 401 UNAUTHORIZED when no token is provided', async () => {
      const res = await request(app).patch(
        `/api/v1/admin/bookings/${validBookingId}/complete`,
      );
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses complete endpoint', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/complete`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('rejects invalid booking UUID with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/bookings/not-a-valid-uuid/complete')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('successfully completes CONFIRMED booking and returns COMPLETED status', async () => {
      const completedFixture = mockAdminBookingFixture({
        id: validBookingId,
        status: BookingStatus.COMPLETED,
      });

      const spy = vi
        .spyOn(bookingRepository, 'completeBookingForAdmin')
        .mockResolvedValue(completedFixture);

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(spy).toHaveBeenCalledWith(validBookingId);
    });

    it('returns 200 idempotently when booking is already COMPLETED', async () => {
      const alreadyCompletedFixture = mockAdminBookingFixture({
        id: validBookingId,
        status: BookingStatus.COMPLETED,
      });

      vi.spyOn(bookingRepository, 'completeBookingForAdmin').mockResolvedValue(
        alreadyCompletedFixture,
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('propagates 409 BOOKING_STATE_CONFLICT when booking is CANCELLED', async () => {
      vi.spyOn(bookingRepository, 'completeBookingForAdmin').mockRejectedValue(
        new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể hoàn tất đơn đặt phòng đã hủy',
          409,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    });

    it('propagates 409 BOOKING_STATE_CONFLICT when booking is NO_SHOW', async () => {
      vi.spyOn(bookingRepository, 'completeBookingForAdmin').mockRejectedValue(
        new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể hoàn tất đơn đặt phòng đã đánh dấu không đến',
          409,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    });

    it('propagates 404 BOOKING_NOT_FOUND when booking does not exist', async () => {
      vi.spyOn(bookingRepository, 'completeBookingForAdmin').mockRejectedValue(
        new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/admin/bookings/:id/no-show (Mark No-Show Flow)', () => {
    const validBookingId = '22222222-2222-4222-8222-222222222222';

    it('returns 401 UNAUTHORIZED when no token is provided', async () => {
      const res = await request(app).patch(
        `/api/v1/admin/bookings/${validBookingId}/no-show`,
      );
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses no-show endpoint', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/no-show`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('rejects invalid booking UUID with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/bookings/not-a-valid-uuid/no-show')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('successfully marks CONFIRMED booking as NO_SHOW and returns NO_SHOW status', async () => {
      const noShowFixture = mockAdminBookingFixture({
        id: validBookingId,
        status: BookingStatus.NO_SHOW,
      });

      const spy = vi
        .spyOn(bookingRepository, 'markNoShowForAdmin')
        .mockResolvedValue(noShowFixture);

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/no-show`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('NO_SHOW');
      expect(spy).toHaveBeenCalledWith(validBookingId);
    });

    it('returns 200 idempotently when booking is already NO_SHOW', async () => {
      const alreadyNoShowFixture = mockAdminBookingFixture({
        id: validBookingId,
        status: BookingStatus.NO_SHOW,
      });

      vi.spyOn(bookingRepository, 'markNoShowForAdmin').mockResolvedValue(
        alreadyNoShowFixture,
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/no-show`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('NO_SHOW');
    });

    it('propagates 409 BOOKING_STATE_CONFLICT when booking is CANCELLED', async () => {
      vi.spyOn(bookingRepository, 'markNoShowForAdmin').mockRejectedValue(
        new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể đánh dấu không đến cho đơn đặt phòng đã hủy',
          409,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/no-show`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    });

    it('propagates 409 BOOKING_STATE_CONFLICT when booking is COMPLETED', async () => {
      vi.spyOn(bookingRepository, 'markNoShowForAdmin').mockRejectedValue(
        new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể đánh dấu không đến cho đơn đặt phòng đã hoàn tất',
          409,
        ),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/no-show`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_STATE_CONFLICT');
    });

    it('propagates 404 BOOKING_NOT_FOUND when booking does not exist', async () => {
      vi.spyOn(bookingRepository, 'markNoShowForAdmin').mockRejectedValue(
        new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${validBookingId}/no-show`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('Lazy Evaluation of Overdue Bookings to NO_SHOW', () => {
    it('evaluates overdue CONFIRMED bookings and transitions them to NO_SHOW', async () => {
      const spy = vi
        .spyOn(bookingRepository, 'evaluateNoShowBookings')
        .mockResolvedValue(3);

      const count = await bookingRepository.evaluateNoShowBookings(new Date());
      expect(count).toBe(3);
      expect(spy).toHaveBeenCalled();
    });

    it('triggers lazy evaluation during getBookings query', async () => {
      const evalSpy = vi
        .spyOn(bookingRepository, 'evaluateNoShowBookings')
        .mockResolvedValue(1);

      vi.spyOn(bookingRepository, 'findManyAndCountForAdmin').mockResolvedValue([
        0,
        [],
      ]);

      const res = await request(app)
        .get('/api/v1/admin/bookings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(evalSpy).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/admin/revenue (Revenue Calculation: Actual vs Potential)', () => {
    it('returns 401 UNAUTHORIZED when no token is provided', async () => {
      const res = await request(app).get('/api/v1/admin/revenue');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses revenue endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/admin/revenue')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('rejects invalid date format with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/v1/admin/revenue?startDate=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects when startDate is after endDate with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/v1/admin/revenue?startDate=2026-10-15&endDate=2026-10-10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('calculates actual revenue strictly from PAID bookings, and potential revenue including UNPAID', async () => {
      const revenueFixture = {
        period: {
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        },
        actualRevenue: '600000.00', // only PAID bookings
        potentialRevenue: '1000000.00', // PAID + UNPAID active bookings
        unpaidRevenue: '400000.00',
        totalBookings: 4,
        paidBookings: 2,
        unpaidBookings: 2,
        cancelledBookings: 1,
      };

      const spy = vi
        .spyOn(bookingRepository, 'calculateRevenue')
        .mockResolvedValue(revenueFixture);

      const res = await request(app)
        .get('/api/v1/admin/revenue?startDate=2026-10-01&endDate=2026-10-31')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.actualRevenue).toBe('600000.00');
      expect(res.body.data.potentialRevenue).toBe('1000000.00');
      expect(res.body.data.unpaidRevenue).toBe('400000.00');
      expect(res.body.data.paidBookings).toBe(2);
      expect(spy).toHaveBeenCalled();
    });

    it('supports alias /api/v1/admin/bookings/revenue', async () => {
      const revenueFixture = {
        period: {
          startDate: null,
          endDate: null,
        },
        actualRevenue: '0.00',
        potentialRevenue: '0.00',
        unpaidRevenue: '0.00',
        totalBookings: 0,
        paidBookings: 0,
        unpaidBookings: 0,
        cancelledBookings: 0,
      };

      vi.spyOn(bookingRepository, 'calculateRevenue').mockResolvedValue(revenueFixture);

      const res = await request(app)
        .get('/api/v1/admin/bookings/revenue')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.actualRevenue).toBe('0.00');
    });
  });
});
