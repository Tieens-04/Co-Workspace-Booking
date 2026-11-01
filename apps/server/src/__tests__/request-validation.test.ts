import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const adminToken = generateToken({ sub: 'admin-uuid-1', role: Role.ADMIN });
const customerToken = generateToken({ sub: 'customer-uuid-1', role: Role.CUSTOMER });
const bookingId = '22222222-2222-4222-8222-222222222222';
// Express' default JSON/urlencoded limit is 100kb; ~110KB must be rejected, not raised.
const oversizedText = 'x'.repeat(110 * 1024);

const expectErrorShape = (body: Record<string, unknown>, code: string) => {
  expect(body).toEqual({ success: false, code, message: expect.any(String) });
};

describe('Request payload limits & lifecycle validation (CWB-53)', () => {
  beforeEach(() => {
    vi.spyOn(bookingRepository, 'evaluateNoShowBookings').mockResolvedValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Body parser errors', () => {
    it('returns 413 PAYLOAD_TOO_LARGE for an oversized JSON body', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'a@example.com', password: oversizedText }));

      expect(res.status).toBe(413);
      expectErrorShape(res.body, 'PAYLOAD_TOO_LARGE');
    });

    it('returns 413 PAYLOAD_TOO_LARGE for an oversized urlencoded body', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .type('form')
        .send(`email=a%40example.com&password=${oversizedText}`);

      expect(res.status).toBe(413);
      expectErrorShape(res.body, 'PAYLOAD_TOO_LARGE');
    });

    it('accepts a JSON body just under the limit and reaches validation', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 'x'.repeat(90 * 1024) });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('keeps malformed JSON as 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "a@example.com",');

      expect(res.status).toBe(400);
      expectErrorShape(res.body, 'VALIDATION_ERROR');
    });

    it('keeps unexpected errors as 500 without leaking internals', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(bookingRepository, 'completeBookingForAdmin').mockRejectedValue(
        new Error('db exploded at /srv/secret'),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
      expectErrorShape(res.body, 'INTERNAL_SERVER_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('/srv/secret');
    });
  });

  describe('Admin booking lifecycle endpoints reject unknown input', () => {
    const lifecycleMethods = {
      complete: 'completeBookingForAdmin',
      'no-show': 'markNoShowForAdmin',
    } as const;

    it.each(Object.entries(lifecycleMethods))(
      'rejects unknown body fields on %s with 400 before touching data',
      async (action, method) => {
        const spy = vi.spyOn(bookingRepository, method);

        const res = await request(app)
          .patch(`/api/v1/admin/bookings/${bookingId}/${action}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: 'CANCELLED', paymentStatus: 'PAID' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(spy).not.toHaveBeenCalled();
      },
    );

    it.each(['payment', 'cancel', 'check-in', 'complete', 'no-show'])(
      'rejects unexpected query parameters on %s with 400',
      async (action) => {
        const res = await request(app)
          .patch(`/api/v1/admin/bookings/${bookingId}/${action}?force=true`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details).toEqual([expect.objectContaining({ field: '' })]);
      },
    );

    it.each(Object.entries(lifecycleMethods))(
      'still accepts an empty body on %s',
      async (action, method) => {
        const spy = vi
          .spyOn(bookingRepository, method)
          .mockResolvedValue({ id: bookingId } as never);

        const res = await request(app)
          .patch(`/api/v1/admin/bookings/${bookingId}/${action}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({});

        expect(res.status).toBe(200);
        expect(spy).toHaveBeenCalledWith(bookingId);
      },
    );

    it.each(Object.keys(lifecycleMethods))(
      'checks authentication and role before input validation on %s',
      async (action) => {
        const unauthenticated = await request(app)
          .patch(`/api/v1/admin/bookings/${bookingId}/${action}?force=true`)
          .send({ status: 'CANCELLED' });
        expect(unauthenticated.status).toBe(401);
        expect(unauthenticated.body.code).toBe('UNAUTHORIZED');

        const customer = await request(app)
          .patch(`/api/v1/admin/bookings/${bookingId}/${action}?force=true`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ status: 'CANCELLED' });
        expect(customer.status).toBe(403);
        expect(customer.body.code).toBe('FORBIDDEN');
      },
    );
  });
});
