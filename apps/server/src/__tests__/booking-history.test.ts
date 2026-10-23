import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Role, BookingStatus, PaymentStatus } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { BookingService } from '../services/booking.service.js';
import { BookingResponseDto } from '../types/booking.type.js';

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
    checkedInAt: null,
    attendanceTrackingEnabled: true,
    ...override,
  };
};

describe('Booking History & Detail Unit Tests (/api/v1/bookings)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & RBAC Controls', () => {
    it('returns 401 UNAUTHORIZED when no token is provided to GET /api/v1/bookings', async () => {
      const res = await request(app).get('/api/v1/bookings');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 UNAUTHORIZED when no token is provided to GET /api/v1/bookings/:id', async () => {
      const res = await request(app).get(`/api/v1/bookings/${validBookingId}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when role ADMIN attempts to GET /api/v1/bookings', async () => {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 403 FORBIDDEN when role ADMIN attempts to GET /api/v1/bookings/:id', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('Validation - Query and Params', () => {
    it('rejects invalid page (page = 0 or negative)', async () => {
      const res1 = await request(app)
        .get('/api/v1/bookings?page=0')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app)
        .get('/api/v1/bookings?page=-1')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid limit (limit = 0 or limit > 100)', async () => {
      const res1 = await request(app)
        .get('/api/v1/bookings?limit=0')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app)
        .get('/api/v1/bookings?limit=101')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid view enum value', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?view=INVALID_VIEW')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unallowed/unexpected query parameters on GET /api/v1/bookings', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?userId=some-user-id')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects non-UUID id on GET /api/v1/bookings/:id', async () => {
      const res = await request(app)
        .get('/api/v1/bookings/not-a-valid-uuid')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unexpected query parameters on GET /api/v1/bookings/:id', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${validBookingId}?extra=value`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/bookings (List and Filters)', () => {
    it('returns 200 with default pagination and ALL view', async () => {
      const fixture = mockBookingFixture();
      vi.spyOn(bookingRepository, 'findManyAndCountForUser').mockResolvedValue([1, [fixture]]);

      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe(validBookingId);
      expect(res.body.data.items[0].bookingCode).toBe('CS-20261025-ABCD');
      expect(res.body.data.items[0].totalAmount).toBe('500000.00');
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });

      expect(bookingRepository.findManyAndCountForUser).toHaveBeenCalledWith(
        customerSub,
        { page: 1, limit: 10, view: 'ALL' },
        expect.any(Date),
      );
    });

    it('handles UPCOMING and COMPLETED view filters correctly', async () => {
      vi.spyOn(bookingRepository, 'findManyAndCountForUser').mockResolvedValue([0, []]);

      await request(app)
        .get('/api/v1/bookings?view=UPCOMING')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(bookingRepository.findManyAndCountForUser).toHaveBeenCalledWith(
        customerSub,
        { page: 1, limit: 10, view: 'UPCOMING' },
        expect.any(Date),
      );

      await request(app)
        .get('/api/v1/bookings?view=COMPLETED')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(bookingRepository.findManyAndCountForUser).toHaveBeenCalledWith(
        customerSub,
        { page: 1, limit: 10, view: 'COMPLETED' },
        expect.any(Date),
      );
    });

    it('returns empty list with total = 0 and totalPages = 0 when customer has no bookings', async () => {
      vi.spyOn(bookingRepository, 'findManyAndCountForUser').mockResolvedValue([0, []]);

      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });

    it('returns empty items but preserves requested page and actual total when page exceeds totalPages', async () => {
      vi.spyOn(bookingRepository, 'findManyAndCountForUser').mockResolvedValue([15, []]);

      const res = await request(app)
        .get('/api/v1/bookings?page=5&limit=10')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination).toEqual({
        page: 5,
        limit: 10,
        total: 15,
        totalPages: 2,
      });
    });
  });

  describe('GET /api/v1/bookings/:id (Detail & Ownership)', () => {
    it('returns 200 with booking detail when booking belongs to user', async () => {
      const fixture = mockBookingFixture();
      vi.spyOn(bookingRepository, 'findByIdForUser').mockResolvedValue(fixture);

      const res = await request(app)
        .get(`/api/v1/bookings/${validBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(validBookingId);
      expect(res.body.data.bookingCode).toBe('CS-20261025-ABCD');
      expect(res.body.data.totalAmount).toBe('500000.00');
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.paymentStatus).toBe('UNPAID');

      expect(bookingRepository.findByIdForUser).toHaveBeenCalledWith(customerSub, validBookingId);
    });

    it('returns 404 BOOKING_NOT_FOUND when booking does not exist or belongs to another customer', async () => {
      vi.spyOn(bookingRepository, 'findByIdForUser').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/bookings/${otherBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
      expect(res.body.message).toBe('Không tìm thấy đặt phòng');
      expect(bookingRepository.findByIdForUser).toHaveBeenCalledWith(customerSub, otherBookingId);
    });
  });

  describe('Service time boundary', () => {
    it('passes fixed now timestamp to repository', async () => {
      const mockRepo = {
        createBooking: vi.fn(),
        findManyAndCountForUser: vi.fn().mockResolvedValue([0, []]),
        findByIdForUser: vi.fn().mockResolvedValue(null),
        cancelBooking: vi.fn(),
      };
      const service = new BookingService(mockRepo);
      const fixedNow = new Date('2026-10-25T08:00:00.000Z');

      await service.getBookings(customerSub, { page: 1, limit: 10, view: 'UPCOMING' }, fixedNow);

      expect(mockRepo.findManyAndCountForUser).toHaveBeenCalledWith(
        customerSub,
        { page: 1, limit: 10, view: 'UPCOMING' },
        fixedNow,
      );
    });
  });
});
