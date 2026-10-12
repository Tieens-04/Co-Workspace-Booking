import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { Role, BookingStatus, PaymentStatus } from '@prisma/client';
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
    customer: {
      kind: 'GUEST',
      name: 'Nguyễn Văn Vãng Lai',
      phone: '0901234567',
    },
    ...override,
  };
};

describe('Admin Booking Management API Unit Tests', () => {
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
});
