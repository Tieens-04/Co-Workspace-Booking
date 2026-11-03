import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import {
  EMAIL_CLAIM_LEASE_MS,
  EMAIL_MAX_ATTEMPTS,
  EmailOutboxService,
  emailRetryDelayMs,
} from '../services/email-outbox.service.js';
import { NotificationService } from '../services/notification.service.js';

describe('CWB-68 durable email outbox (real MySQL)', () => {
  const prefix = `test_outbox_${randomUUID().slice(0, 8)}`;
  const customerEmail = `${prefix}_customer@example.com`;
  let customerId: string;
  let customerToken: string;
  let adminToken: string;
  let adminId: string;
  let roomId: string;
  let dayOffset = 3;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const nextSlot = () => {
    const base = new Date();
    base.setUTCHours(2, 0, 0, 0); // 09:00 Vietnam
    const start = new Date(base.getTime() + dayOffset++ * 86_400_000);
    return {
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    };
  };

  /** Notification double; `canDeliver` true so the worker really attempts delivery. */
  const fakeNotifier = (outcome: () => Promise<boolean> = async () => true) => {
    const confirmation = vi.fn(outcome);
    const cancellation = vi.fn(outcome);
    const notifier = {
      canDeliver: () => true,
      sendBookingConfirmation: confirmation,
      sendBookingCancellation: cancellation,
    } as unknown as NotificationService;
    return { notifier, confirmation, cancellation };
  };

  const outboxFor = (bookingId: string) =>
    prisma.emailOutbox.findMany({ where: { bookingId }, orderBy: { kind: 'asc' } });

  /** Other suites may leave due rows; only this suite's rooms are relevant here. */
  const isolateQueue = () =>
    prisma.emailOutbox.updateMany({
      where: { status: 'QUEUED', booking: { roomId: { not: roomId } } },
      data: { status: 'SKIPPED', lastError: 'TEST_ISOLATION' },
    });

  async function book() {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set(auth(customerToken))
      .send({
        roomId,
        ...nextSlot(),
      });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; bookingCode: string };
  }

  beforeAll(async () => {
    const customer = await prisma.user.create({
      data: {
        email: customerEmail,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Khách Outbox',
        role: Role.CUSTOMER,
      },
    });
    customerId = customer.id;
    customerToken = generateToken({ sub: customerId, role: Role.CUSTOMER });
    const admin = await prisma.user.create({
      data: {
        email: `${prefix}_admin@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Admin Outbox',
        role: Role.ADMIN,
      },
    });
    adminId = admin.id;
    adminToken = generateToken({ sub: adminId, role: Role.ADMIN });
    const room = await prisma.room.create({
      data: {
        name: `${prefix}_room`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('150.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    roomId = room.id;
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    // email_outbox rows cascade with their bookings.
    await prisma.booking.deleteMany({ where: { roomId } });
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, adminId] } } });
    await prisma.$disconnect();
  });

  it('queues the confirmation in the booking transaction and sends it exactly once', async () => {
    const booking = await book();
    const [queued] = await outboxFor(booking.id);
    expect(queued).toMatchObject({ kind: 'BOOKING_CONFIRMATION', status: 'QUEUED', attempts: 0 });

    await isolateQueue();
    const { notifier, confirmation } = fakeNotifier();
    const worker = new EmailOutboxService(notifier);
    expect((await worker.processDue()).sent).toBeGreaterThanOrEqual(1);
    expect((await worker.processDue()).claimed).toBe(0);

    expect(confirmation).toHaveBeenCalledTimes(1);
    expect(confirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: customerEmail,
        bookingCode: booking.bookingCode,
        totalAmount: '300.00',
      }),
    );
    const [sent] = await outboxFor(booking.id);
    expect(sent).toMatchObject({ status: 'SENT', attempts: 1, lastError: null });
    expect(sent.sentAt).toBeInstanceOf(Date);
  });

  it('retries SMTP failures with backoff, then parks the email as FAILED; the booking stays valid', async () => {
    const booking = await book();
    await isolateQueue();
    const { notifier, confirmation } = fakeNotifier(async () => false);
    const worker = new EmailOutboxService(notifier);

    let now = new Date();
    for (let attempt = 1; attempt <= EMAIL_MAX_ATTEMPTS; attempt++) {
      await worker.processDue(now);
      const [row] = await outboxFor(booking.id);
      expect(row.attempts).toBe(attempt);
      if (attempt < EMAIL_MAX_ATTEMPTS) {
        expect(row).toMatchObject({ status: 'QUEUED', lastError: 'SMTP_ERROR' });
        expect(row.nextAttemptAt.getTime()).toBe(now.getTime() + emailRetryDelayMs(attempt));
        // Not due before the backoff elapses.
        expect((await worker.processDue(new Date(row.nextAttemptAt.getTime() - 1))).claimed).toBe(
          0,
        );
        now = row.nextAttemptAt;
      } else {
        expect(row).toMatchObject({ status: 'FAILED', lastError: 'SMTP_ERROR' });
      }
    }
    expect(confirmation).toHaveBeenCalledTimes(EMAIL_MAX_ATTEMPTS);
    const persisted = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(persisted?.status).toBe(BookingStatus.CONFIRMED);
  });

  it('recovers a message claimed by a worker that died before recording the result', async () => {
    const booking = await book();
    await isolateQueue();
    const crashedAt = new Date();
    // Simulate a crash mid-send: the row was claimed (lease pushed forward) but never finished.
    await prisma.emailOutbox.updateMany({
      where: { bookingId: booking.id },
      data: { attempts: 1, nextAttemptAt: new Date(crashedAt.getTime() + EMAIL_CLAIM_LEASE_MS) },
    });
    const { notifier, confirmation } = fakeNotifier();
    const restarted = new EmailOutboxService(notifier);

    expect((await restarted.processDue(crashedAt)).claimed).toBe(0);
    await restarted.processDue(new Date(crashedAt.getTime() + EMAIL_CLAIM_LEASE_MS));
    expect(confirmation).toHaveBeenCalledTimes(1);
    expect((await outboxFor(booking.id))[0]).toMatchObject({ status: 'SENT', attempts: 2 });
  });

  it('queues one cancellation email even when customer and admin cancel repeatedly', async () => {
    const booking = await book();
    const path = `/api/v1/bookings/${booking.id}/cancel`;
    expect((await request(app).patch(path).set(auth(customerToken))).status).toBe(200);
    expect((await request(app).patch(path).set(auth(customerToken))).status).toBe(200);
    const adminCancel = await request(app)
      .patch(`/api/v1/admin/bookings/${booking.id}/cancel`)
      .set(auth(adminToken))
      .send({ reason: 'Hủy lặp' });
    expect(adminCancel.status).toBe(200);

    const rows = await outboxFor(booking.id);
    expect(rows.map((r) => r.kind)).toEqual(['BOOKING_CONFIRMATION', 'BOOKING_CANCELLATION']);

    await isolateQueue();
    const { notifier, confirmation, cancellation } = fakeNotifier();
    await new EmailOutboxService(notifier).processDue();
    // The confirmation of a booking cancelled before delivery is skipped, not sent.
    expect(confirmation).not.toHaveBeenCalled();
    expect(cancellation).toHaveBeenCalledTimes(1);
    expect((await outboxFor(booking.id)).map((r) => [r.kind, r.status, r.lastError])).toEqual([
      ['BOOKING_CONFIRMATION', 'SKIPPED', 'BOOKING_CANCELLED'],
      ['BOOKING_CANCELLATION', 'SENT', null],
    ]);
  });

  it('never delivers a claimed message twice when workers run concurrently', async () => {
    const bookings = [];
    for (let i = 0; i < 6; i++) bookings.push(await book());
    await isolateQueue();
    const { notifier, confirmation } = fakeNotifier(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return true;
    });
    const workers = [0, 1, 2].map(() => new EmailOutboxService(notifier));
    await Promise.all(workers.map((w) => w.processDue(new Date(), 2)));
    await Promise.all(workers.map((w) => w.processDue(new Date(), 10)));

    const codes = confirmation.mock.calls.map(([payload]) => payload.bookingCode);
    expect(codes.sort()).toEqual(bookings.map((b) => b.bookingCode).sort());
    const statuses = await prisma.emailOutbox.findMany({
      where: { bookingId: { in: bookings.map((b) => b.id) } },
    });
    expect(statuses.every((r) => r.status === 'SENT' && r.attempts === 1)).toBe(true);
  });

  it('queues nothing for walk-in guests and skips delivery when SMTP is not configured', async () => {
    const guest = await request(app)
      .post('/api/v1/admin/bookings/guest')
      .set(auth(adminToken))
      .send({ roomId, ...nextSlot(), guestName: 'Khách lẻ', guestPhone: '0911222333' });
    expect(guest.status).toBe(201);
    expect(await outboxFor(guest.body.data.id)).toHaveLength(0);

    const booking = await book();
    await isolateQueue();
    const disabled = new NotificationService({ smtpUser: '', smtpPass: '' });
    await new EmailOutboxService(disabled).processDue();
    expect((await outboxFor(booking.id))[0]).toMatchObject({
      status: 'SKIPPED',
      lastError: 'SMTP_DISABLED',
    });
  });

  it('logs SMTP failures without the recipient address or credentials', async () => {
    const booking = await book();
    await isolateQueue();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unreachable = new NotificationService({
      smtpHost: '127.0.0.1',
      smtpPort: 1,
      smtpUser: 'outbox-user@example.com',
      smtpPass: 'outbox-secret-pass',
      smtpFrom: 'no-reply@example.com',
    });
    expect((await new EmailOutboxService(unreachable).processDue()).retried).toBeGreaterThanOrEqual(
      1,
    );

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain(booking.bookingCode);
    expect(logged).not.toContain(customerEmail);
    expect(logged).not.toContain('outbox-secret-pass');
    expect(logged).not.toContain('outbox-user@example.com');
  });

  describe('admin API', () => {
    it('requires ADMIN: 401 without token, 403 for a customer', async () => {
      expect((await request(app).get('/api/v1/admin/email-outbox')).status).toBe(401);
      expect(
        (await request(app).get('/api/v1/admin/email-outbox').set(auth(customerToken))).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`/api/v1/admin/email-outbox/${randomUUID()}/retry`)
            .set(auth(customerToken))
        ).status,
      ).toBe(403);
    });

    it('lists delivery status without recipient data and requeues FAILED messages only', async () => {
      const booking = await book();
      const [row] = await outboxFor(booking.id);
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: { status: 'FAILED', attempts: EMAIL_MAX_ATTEMPTS, lastError: 'SMTP_ERROR' },
      });

      const list = await request(app)
        .get('/api/v1/admin/email-outbox')
        .query({ bookingId: booking.id, status: 'FAILED' })
        .set(auth(adminToken));
      expect(list.status).toBe(200);
      expect(list.body.data.items).toHaveLength(1);
      expect(list.body.data.items[0]).toMatchObject({
        id: row.id,
        kind: 'BOOKING_CONFIRMATION',
        bookingCode: booking.bookingCode,
        status: 'FAILED',
        attempts: EMAIL_MAX_ATTEMPTS,
      });
      expect(JSON.stringify(list.body)).not.toContain(customerEmail);

      const retry = await request(app)
        .post(`/api/v1/admin/email-outbox/${row.id}/retry`)
        .set(auth(adminToken));
      expect(retry.status).toBe(200);
      expect(retry.body.data).toMatchObject({ status: 'QUEUED', attempts: 0, lastError: null });

      const again = await request(app)
        .post(`/api/v1/admin/email-outbox/${row.id}/retry`)
        .set(auth(adminToken));
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('EMAIL_NOT_RETRYABLE');

      const missing = await request(app)
        .post(`/api/v1/admin/email-outbox/${randomUUID()}/retry`)
        .set(auth(adminToken));
      expect(missing.status).toBe(404);

      for (const query of [{ status: 'DONE' }, { limit: 101 }, { bookingId: 'x' }, { to: 'a' }]) {
        const bad = await request(app)
          .get('/api/v1/admin/email-outbox')
          .query(query)
          .set(auth(adminToken));
        expect(bad.status).toBe(400);
      }
    });
  });
});
