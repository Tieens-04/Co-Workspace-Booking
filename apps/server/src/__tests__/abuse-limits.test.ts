import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { ipKeyGenerator } from 'express-rate-limit';
import { Role } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import {
  createBookingRateLimiter,
  registerRateLimiter,
} from '../middlewares/rate-limit.middleware.js';

// CWB-78: abuse limits on the two free, unauthenticated-cost operations.
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const customerA = 'cwb78-customer-a';
const customerB = 'cwb78-customer-b';
const tokenA = generateToken({ sub: customerA, role: Role.CUSTOMER });
const tokenB = generateToken({ sub: customerB, role: Role.CUSTOMER });

const expectTooManyRequests = (res: request.Response) => {
  expect(res.status).toBe(429);
  expect(res.body).toMatchObject({ success: false, code: 'TOO_MANY_REQUESTS' });
  expect(typeof res.body.message).toBe('string');
  expect(res.headers['ratelimit-limit']).toBeDefined();
};

beforeEach(async () => {
  for (const address of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
    await registerRateLimiter.resetKey(ipKeyGenerator(address, 56));
  }
  await createBookingRateLimiter.resetKey(`user:${customerA}`);
  await createBookingRateLimiter.resetKey(`user:${customerB}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/v1/auth/register rate limit (CWB-78)', () => {
  it('counts every request per IP and answers the 11th within the hour with 429', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/v1/auth/register').send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    }

    expectTooManyRequests(
      await request(app).post('/api/v1/auth/register').send({ email: 'not-an-email' }),
    );
  });
});

describe('POST /api/v1/bookings rate limit (CWB-78)', () => {
  it('limits each customer to 20 requests per window, keyed by account rather than IP', async () => {
    const create = vi.spyOn(bookingRepository, 'createBooking');

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({});
      expect(res.status).toBe(400);
    }

    expectTooManyRequests(
      await request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${tokenA}`).send({}),
    );
    expect(create).not.toHaveBeenCalled();

    // Same IP, different account: not throttled.
    const other = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({});
    expect(other.status).toBe(400);
  });

  it('authenticates before throttling, so anonymous requests get 401', async () => {
    for (let i = 0; i < 21; i++) {
      const res = await request(app).post('/api/v1/bookings').send({});
      expect(res.status).toBe(401);
    }
  });

  it('does not throttle reading bookings', async () => {
    for (let i = 0; i < 20; i++) {
      await request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${tokenA}`).send({});
    }
    const list = await request(app)
      .get('/api/v1/bookings?page=0')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(list.status).toBe(400);
  });
});
