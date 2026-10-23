import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { AppError } from '../utils/error.util.js';

vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const id = '11111111-1111-4111-8111-111111111111';
const path = `/api/v1/admin/bookings/${id}/check-in`;
const admin = generateToken({ sub: 'admin', role: Role.ADMIN });
const customer = generateToken({ sub: 'customer', role: Role.CUSTOMER });

afterEach(() => vi.restoreAllMocks());

describe('ADMIN check-in HTTP contract', () => {
  it('requires authentication and ADMIN authorization', async () => {
    expect((await request(app).patch(path).send({})).status).toBe(401);
    expect(
      (await request(app).patch(path).set('Authorization', `Bearer ${customer}`).send({})).status,
    ).toBe(403);
  });

  it('rejects invalid IDs and client-controlled attendance fields', async () => {
    const spy = vi.spyOn(bookingRepository, 'checkInBookingForAdmin');
    expect(
      (
        await request(app)
          .patch('/api/v1/admin/bookings/invalid/check-in')
          .set('Authorization', `Bearer ${admin}`)
          .send({})
      ).status,
    ).toBe(400);
    for (const body of [
      { checkedInAt: new Date().toISOString() },
      { attendanceTrackingEnabled: false },
      { status: 'COMPLETED' },
    ]) {
      expect(
        (await request(app).patch(path).set('Authorization', `Bearer ${admin}`).send(body)).status,
      ).toBe(400);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([404, 409])('preserves repository business errors (%i)', async (status) => {
    vi.spyOn(bookingRepository, 'checkInBookingForAdmin').mockRejectedValue(
      new AppError(
        status === 404 ? 'BOOKING_NOT_FOUND' : 'BOOKING_STATE_CONFLICT',
        'Không thể check-in',
        status,
      ),
    );
    const response = await request(app)
      .patch(path)
      .set('Authorization', `Bearer ${admin}`)
      .send({});
    expect(response.status).toBe(status);
    expect(response.body.success).toBe(false);
  });
});
