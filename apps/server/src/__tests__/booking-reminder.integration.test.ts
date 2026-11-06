import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, PaymentStatus, Prisma, RoomStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { EmailOutboxService } from '../services/email-outbox.service.js';
import { NotificationService } from '../services/notification.service.js';

const HOUR = 3_600_000;

/**
 * CWB-80: reminder emails. A fixed `now` far in the future keeps this suite's window free of
 * bookings left by other suites, so counts below are exact.
 */
describe('Booking reminder emails (CWB-80, real MySQL)', () => {
  const tag = randomUUID().slice(0, 8);
  const now = new Date('2031-03-03T01:00:00.000Z'); // 08:00 Vietnam
  let customerId: string;
  let roomId: string;
  let seq = 0;

  const fakeNotifier = (outcome: () => Promise<boolean> = async () => true) => {
    const reminder = vi.fn(outcome);
    const notifier = {
      canDeliver: () => true,
      sendBookingConfirmation: vi.fn(async () => true),
      sendBookingCancellation: vi.fn(async () => true),
      sendBookingReminder: reminder,
    } as unknown as NotificationService;
    return { notifier, reminder };
  };

  const booking = (
    startOffsetMs: number,
    overrides: Partial<Prisma.BookingUncheckedCreateInput> = {},
  ) => {
    const start = new Date(now.getTime() + startOffsetMs);
    return prisma.booking.create({
      data: {
        bookingCode: `REM-${tag}-${++seq}`,
        userId: customerId,
        roomId,
        startTime: start,
        endTime: new Date(start.getTime() + HOUR),
        totalAmount: new Prisma.Decimal('150000.00'),
        status: BookingStatus.CONFIRMED,
        // Booked well before the reminder window opened.
        createdAt: new Date(now.getTime() - 3 * 24 * HOUR),
        ...overrides,
      },
    });
  };

  const reminderRows = (bookingId: string) =>
    prisma.emailOutbox.findMany({ where: { bookingId, kind: 'BOOKING_REMINDER' } });

  /** Only this suite's reminders may be due while it drives the worker directly. */
  const isolateQueue = () =>
    prisma.emailOutbox.updateMany({
      where: { status: 'QUEUED', booking: { roomId: { not: roomId } } },
      data: { status: 'SKIPPED', lastError: 'TEST_ISOLATION' },
    });

  beforeAll(async () => {
    const customer = await prisma.user.create({
      data: {
        email: `reminder_${tag}@example.com`,
        passwordHash: '!integration-test-account',
        fullName: 'Khách <b>Nhắc</b>',
      },
    });
    customerId = customer.id;
    const room = await prisma.room.create({
      data: {
        name: `Reminder ${tag}`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('150000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { roomId } }); // cascades outbox rows
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.user.deleteMany({ where: { id: customerId } });
  });

  it('queues exactly the CONFIRMED customer bookings starting within the window', async () => {
    const inside = await booking(2 * HOUR); // boundary: exactly X hours ahead
    const soon = await booking(30 * 60_000);
    const tooEarly = await booking(2 * HOUR + 30 * 60_000);
    const started = await booking(-30 * 60_000);
    const cancelled = await booking(HOUR, { status: BookingStatus.CANCELLED });
    const completed = await booking(HOUR, { status: BookingStatus.COMPLETED });
    const guest = await booking(HOUR, {
      userId: null,
      guestName: 'Vãng lai',
      guestPhone: '0901234567',
    });
    // Booked 1h40m before its start, i.e. inside the 2-hour window: the confirmation is the reminder.
    const lastMinute = await booking(90 * 60_000, {
      createdAt: new Date(now.getTime() - 10 * 60_000),
    });

    const service = new EmailOutboxService(fakeNotifier().notifier);
    const queued = await service.enqueueDueReminders(now, 2);

    expect(queued).toBe(2);
    expect(await reminderRows(inside.id)).toHaveLength(1);
    expect(await reminderRows(soon.id)).toHaveLength(1);
    for (const skipped of [tooEarly, started, cancelled, completed, guest, lastMinute]) {
      expect(await reminderRows(skipped.id)).toHaveLength(0);
    }
  });

  it('is idempotent across reruns and concurrent workers', async () => {
    const target = await booking(90 * 60_000);
    const a = new EmailOutboxService(fakeNotifier().notifier);
    const b = new EmailOutboxService(fakeNotifier().notifier);

    await Promise.all([a.enqueueDueReminders(now, 2), b.enqueueDueReminders(now, 2)]);
    await a.enqueueDueReminders(new Date(now.getTime() + 60_000), 2);

    expect(await reminderRows(target.id)).toHaveLength(1);
  });

  it('sends the reminder once with booking details and payment status', async () => {
    const target = await booking(100 * 60_000, { paymentStatus: PaymentStatus.UNPAID });
    const { notifier, reminder } = fakeNotifier();
    const service = new EmailOutboxService(notifier);
    await service.enqueueDueReminders(now, 2);
    await isolateQueue();

    const result = await service.processDue(now, 50);

    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(reminder).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingCode: target.bookingCode,
        roomName: `Reminder ${tag}`,
        recipientEmail: `reminder_${tag}@example.com`,
        totalAmount: '150000.00',
        isPaid: false,
        startTime: target.startTime,
      }),
    );
    const [row] = await reminderRows(target.id);
    expect(row.status).toBe('SENT');

    // Sent reminders are never queued again.
    await service.enqueueDueReminders(new Date(now.getTime() + 5 * 60_000), 2);
    expect(await reminderRows(target.id)).toHaveLength(1);
  });

  it('skips a reminder whose booking was cancelled or already started before sending', async () => {
    const cancelledLater = await booking(110 * 60_000);
    const startsSoon = await booking(115 * 60_000);
    const { notifier, reminder } = fakeNotifier();
    const service = new EmailOutboxService(notifier);
    await service.enqueueDueReminders(now, 2);
    await prisma.booking.update({
      where: { id: cancelledLater.id },
      data: { status: BookingStatus.CANCELLED },
    });
    await isolateQueue();

    // The worker was down until after `startsSoon` began.
    await service.processDue(new Date(now.getTime() + 116 * 60_000), 50);

    const [cancelledRow] = await reminderRows(cancelledLater.id);
    expect(cancelledRow).toMatchObject({ status: 'SKIPPED', lastError: 'BOOKING_CANCELLED' });
    const [expiredRow] = await reminderRows(startsSoon.id);
    expect(expiredRow).toMatchObject({ status: 'SKIPPED', lastError: 'REMINDER_EXPIRED' });
    expect(reminder).not.toHaveBeenCalledWith(
      expect.objectContaining({ bookingCode: cancelledLater.bookingCode }),
    );
  });

  it('re-checks the booking on an admin retry and keeps the booking unchanged on SMTP failure', async () => {
    const target = await booking(105 * 60_000);
    const failing = fakeNotifier(async () => false);
    const service = new EmailOutboxService(failing.notifier);
    await service.enqueueDueReminders(now, 2);
    await isolateQueue();

    await service.processDue(now, 50);
    const [afterFailure] = await reminderRows(target.id);
    expect(afterFailure).toMatchObject({ status: 'QUEUED', lastError: 'SMTP_ERROR', attempts: 1 });
    const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: target.id } });
    expect(unchanged.status).toBe(BookingStatus.CONFIRMED);
    expect(unchanged.paymentStatus).toBe(PaymentStatus.UNPAID);

    // Park it as FAILED, cancel the booking, then the admin requeues it.
    await prisma.emailOutbox.update({
      where: { id: afterFailure.id },
      data: { status: 'FAILED' },
    });
    await prisma.booking.update({
      where: { id: target.id },
      data: { status: BookingStatus.CANCELLED },
    });
    await service.retry(afterFailure.id, now);
    await isolateQueue();
    await service.processDue(now, 50);

    const [final] = await reminderRows(target.id);
    expect(final).toMatchObject({ status: 'SKIPPED', lastError: 'BOOKING_CANCELLED' });
  });
});
