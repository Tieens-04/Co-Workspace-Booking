import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, PaymentStatus, Prisma, Role } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { ENV } from '../config/env.config.js';
import { generateToken } from '../utils/jwt.util.js';
import { EmailOutboxService } from '../services/email-outbox.service.js';
import { NotificationService } from '../services/notification.service.js';
import { TestAccounts } from './support/test-accounts.js';

const HOUR = 3_600_000;

describe('QR payment instructions and payment receipt email (CWB-89, real MySQL)', () => {
  const prefix = `test_receipt_${randomUUID()}`;
  const admins = new TestAccounts();
  const adminToken = admins.token(Role.ADMIN);
  let customerId: string;
  let customerToken: string;
  let roomId: string;
  let seq = 0;
  const originalPayment = ENV.PAYMENT;

  const createBooking = async (
    data: Partial<Prisma.BookingUncheckedCreateInput> & { guest?: boolean } = {},
  ) => {
    seq += 1;
    const { guest, ...rest } = data;
    const start = new Date(Date.now() + (48 + seq * 3) * HOUR);
    start.setUTCMinutes(0, 0, 0);
    return prisma.booking.create({
      data: {
        bookingCode: `CS-20991231-${randomUUID().slice(0, 4).toUpperCase()}`,
        roomId,
        ...(guest
          ? { guestName: 'Khách vãng lai', guestPhone: '0904000001' }
          : { userId: customerId }),
        startTime: start,
        endTime: new Date(start.getTime() + 2 * HOUR),
        totalAmount: new Prisma.Decimal('250000.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        ...rest,
      },
    });
  };

  const confirmPayment = (bookingId: string, paymentMethod: 'CASH' | 'QR' = 'QR') =>
    request(app)
      .patch(`/api/v1/admin/bookings/${bookingId}/payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentMethod });

  /** Runs worker passes until the row leaves QUEUED (other suites' rows may share the queue). */
  const drain = async (worker: EmailOutboxService, outboxId: string) => {
    for (let pass = 0; pass < 20; pass++) {
      const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: outboxId } });
      if (row.status !== 'QUEUED' || row.nextAttemptAt.getTime() > Date.now()) return row;
      await worker.processDue(new Date(), 50);
    }
    return prisma.emailOutbox.findUniqueOrThrow({ where: { id: outboxId } });
  };

  beforeAll(async () => {
    await admins.persist();
    const customer = await prisma.user.create({
      data: {
        email: `${prefix}@example.com`,
        passwordHash: '!integration-test-account',
        fullName: 'Trần Thu Hà',
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
      },
    });
    customerId = customer.id;
    customerToken = generateToken({ sub: customer.id, role: customer.role });
    const room = await prisma.room.create({
      data: { name: `${prefix}_room`, capacity: 4, pricePerHour: '125000.00', status: 'AVAILABLE' },
    });
    roomId = room.id;
  });

  afterEach(() => {
    ENV.PAYMENT = originalPayment;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await admins.cleanup();
    await prisma.booking.deleteMany({ where: { roomId } });
    await prisma.user.deleteMany({ where: { id: customerId } });
    await prisma.room.deleteMany({ where: { id: roomId } });
  });

  it('shows transfer instructions with the booking code and server amount on an UNPAID booking', async () => {
    ENV.PAYMENT = {
      bankName: 'Vietcombank',
      accountNumber: '0123456789',
      accountName: 'CONG TY CO SPACE',
    };
    const booking = await createBooking();

    const res = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.paidAt).toBeNull();
    expect(res.body.data.paymentInstructions).toEqual({
      bankName: 'Vietcombank',
      accountNumber: '0123456789',
      accountName: 'CONG TY CO SPACE',
      transferContent: booking.bookingCode,
      amount: '250000.00',
    });
  });

  it('omits instructions when no receiving account is configured', async () => {
    ENV.PAYMENT = null;
    const booking = await createBooking();

    const res = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.paymentInstructions).toBeNull();
  });

  it('records paidAt, queues exactly one receipt and shows the paid state to the customer', async () => {
    ENV.PAYMENT = {
      bankName: 'Vietcombank',
      accountNumber: '0123456789',
      accountName: 'CONG TY CO SPACE',
    };
    const booking = await createBooking();
    const before = Date.now();

    expect((await confirmPayment(booking.id, 'QR')).status).toBe(200);
    // Idempotent repeat: still PAID, paidAt unchanged, no second receipt.
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.paidAt).toBeInstanceOf(Date);
    expect(stored.paidAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect((await confirmPayment(booking.id, 'CASH')).status).toBe(200);
    const again = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(again.paidAt).toEqual(stored.paidAt);

    const receipts = await prisma.emailOutbox.findMany({
      where: { bookingId: booking.id, kind: 'PAYMENT_RECEIPT' },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('QUEUED');

    const res = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.body.data).toMatchObject({
      paymentStatus: 'PAID',
      paymentMethod: 'QR',
      paidAt: stored.paidAt!.toISOString(),
      paymentInstructions: null,
    });
  });

  it('never queues a receipt for a walk-in guest booking (no email)', async () => {
    const booking = await createBooking({ guest: true });
    expect((await confirmPayment(booking.id, 'CASH')).status).toBe(200);
    expect(
      await prisma.emailOutbox.count({ where: { bookingId: booking.id, kind: 'PAYMENT_RECEIPT' } }),
    ).toBe(0);
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.paidAt).toBeInstanceOf(Date);
  });

  it('delivers the receipt with amount, method and payment time', async () => {
    const booking = await createBooking();
    expect((await confirmPayment(booking.id, 'QR')).status).toBe(200);
    const receipt = await prisma.emailOutbox.findFirstOrThrow({
      where: { bookingId: booking.id, kind: 'PAYMENT_RECEIPT' },
    });
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

    const notification = new NotificationService();
    vi.spyOn(notification, 'canDeliver').mockReturnValue(true);
    const send = vi.spyOn(notification, 'sendPaymentReceipt').mockResolvedValue(true);
    vi.spyOn(notification, 'sendBookingConfirmation').mockResolvedValue(true);
    vi.spyOn(notification, 'sendBookingReminder').mockResolvedValue(true);
    vi.spyOn(notification, 'sendBookingCancellation').mockResolvedValue(true);
    vi.spyOn(notification, 'sendBookingRescheduled').mockResolvedValue(true);
    vi.spyOn(notification, 'sendEmailVerification').mockResolvedValue(true);

    const row = await drain(new EmailOutboxService(notification), receipt.id);

    expect(row).toMatchObject({ status: 'SENT' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: `${prefix}@example.com`,
        customerName: 'Trần Thu Hà',
        bookingCode: booking.bookingCode,
        totalAmount: '250000.00',
        paymentMethod: 'QR',
        paidAt: stored.paidAt,
      }),
    );
  });

  it('keeps the booking PAID and retries the receipt when SMTP fails', async () => {
    const booking = await createBooking();
    expect((await confirmPayment(booking.id, 'CASH')).status).toBe(200);
    const receipt = await prisma.emailOutbox.findFirstOrThrow({
      where: { bookingId: booking.id, kind: 'PAYMENT_RECEIPT' },
    });

    const notification = new NotificationService();
    vi.spyOn(notification, 'canDeliver').mockReturnValue(true);
    const send = vi.spyOn(notification, 'sendPaymentReceipt').mockResolvedValue(false);
    vi.spyOn(notification, 'sendBookingConfirmation').mockResolvedValue(true);
    vi.spyOn(notification, 'sendBookingReminder').mockResolvedValue(true);
    vi.spyOn(notification, 'sendBookingCancellation').mockResolvedValue(true);
    vi.spyOn(notification, 'sendBookingRescheduled').mockResolvedValue(true);
    vi.spyOn(notification, 'sendEmailVerification').mockResolvedValue(true);

    const row = await drain(new EmailOutboxService(notification), receipt.id);

    expect(send).toHaveBeenCalled();
    expect(row).toMatchObject({ status: 'QUEUED', lastError: 'SMTP_ERROR', attempts: 1 });
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.paymentStatus).toBe(PaymentStatus.PAID);
    expect(stored.paymentMethod).toBe('CASH');
  });

  it('skips a queued receipt once the booking is no longer PAID', async () => {
    const booking = await createBooking();
    const receipt = await prisma.emailOutbox.create({
      data: { kind: 'PAYMENT_RECEIPT', bookingId: booking.id },
    });
    const notification = new NotificationService();
    vi.spyOn(notification, 'canDeliver').mockReturnValue(true);
    const send = vi.spyOn(notification, 'sendPaymentReceipt').mockResolvedValue(true);

    const row = await drain(new EmailOutboxService(notification), receipt.id);

    expect(row).toMatchObject({ status: 'SKIPPED', lastError: 'BOOKING_NOT_PAID' });
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ bookingCode: booking.bookingCode }),
    );
  });
});
