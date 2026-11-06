import { BookingStatus, EmailOutboxStatus, Prisma, PrismaClient } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { AppError } from '../utils/error.util.js';
import { trackBackgroundTask } from '../utils/background-tasks.util.js';
import { ENV } from '../config/env.config.js';
import {
  notificationService as defaultNotificationService,
  NotificationService,
} from './notification.service.js';

/** Attempts before a message is parked as FAILED; an admin can requeue it. */
export const EMAIL_MAX_ATTEMPTS = 5;
/** A claimed message is invisible to other workers for this long (covers SMTP timeouts). */
export const EMAIL_CLAIM_LEASE_MS = 2 * 60_000;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const BATCH_SIZE = 10;
/** Upper bound of reminders queued per pass; the next pass picks up the rest. */
const REMINDER_ENQUEUE_LIMIT = 200;

/** 30s, 60s, 120s, ... capped at 1h after the n-th failed attempt. */
export const emailRetryDelayMs = (attempts: number) =>
  Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));

export interface ProcessResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
}

const outboxInclude = {
  booking: {
    select: {
      bookingCode: true,
      status: true,
      startTime: true,
      endTime: true,
      totalAmount: true,
      paymentStatus: true,
      cancellationReason: true,
      room: { select: { name: true } },
      user: { select: { email: true, fullName: true } },
    },
  },
} satisfies Prisma.EmailOutboxInclude;

type OutboxRecord = Prisma.EmailOutboxGetPayload<{ include: typeof outboxInclude }>;

export interface EmailOutboxFilter {
  page: number;
  limit: number;
  status?: EmailOutboxStatus;
  bookingId?: string;
}

const toDto = (row: OutboxRecord) => ({
  id: row.id,
  kind: row.kind,
  bookingId: row.bookingId,
  bookingCode: row.booking.bookingCode,
  status: row.status,
  attempts: row.attempts,
  lastError: row.lastError,
  nextAttemptAt: row.nextAttemptAt,
  sentAt: row.sentAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
export type EmailOutboxDto = ReturnType<typeof toDto>;

/**
 * Delivers queued booking emails with bounded retries. Delivery is at-least-once: a worker that
 * dies after SMTP accepted a message but before recording SENT leaves the row to be retried once
 * its lease expires. Rows are claimed with SELECT ... FOR UPDATE SKIP LOCKED so concurrent
 * workers (or instances) never send the same claimed row twice.
 */
export class EmailOutboxService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<ProcessResult> | null = null;

  constructor(
    private readonly notification: NotificationService = defaultNotificationService,
    private readonly db: PrismaClient = prisma,
  ) {}

  /** Claims due rows and pushes their lease forward, so a crash leaves them retryable later. */
  private async claimDue(now: Date, limit: number): Promise<string[]> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM email_outbox
        WHERE status = 'QUEUED' AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;
      const ids = rows.map((row) => row.id);
      if (ids.length > 0) {
        await tx.emailOutbox.updateMany({
          where: { id: { in: ids } },
          data: {
            attempts: { increment: 1 },
            nextAttemptAt: new Date(now.getTime() + EMAIL_CLAIM_LEASE_MS),
          },
        });
      }
      return ids;
    });
  }

  private async finish(id: string, data: Prisma.EmailOutboxUpdateManyMutationInput): Promise<void> {
    // Only a still-queued row is finalized; an admin action in between is never overwritten.
    await this.db.emailOutbox.updateMany({ where: { id, status: 'QUEUED' }, data });
  }

  private async deliver(row: OutboxRecord): Promise<boolean> {
    const { booking } = row;
    const base = {
      recipientEmail: booking.user!.email,
      customerName: booking.user!.fullName,
      bookingCode: booking.bookingCode,
      roomName: booking.room.name,
      startTime: booking.startTime,
      endTime: booking.endTime,
    };
    switch (row.kind) {
      case 'BOOKING_CONFIRMATION':
        return this.notification.sendBookingConfirmation({
          ...base,
          totalAmount: booking.totalAmount.toFixed(2),
        });
      case 'BOOKING_REMINDER':
        return this.notification.sendBookingReminder({
          ...base,
          totalAmount: booking.totalAmount.toFixed(2),
          isPaid: booking.paymentStatus === 'PAID',
        });
      default:
        return this.notification.sendBookingCancellation({
          ...base,
          reason: booking.cancellationReason,
        });
    }
  }

  /**
   * CWB-80: queues a reminder for every CONFIRMED customer booking that starts within the next
   * `leadHours`. The (kind, booking) unique key + skipDuplicates makes reruns and concurrent
   * instances idempotent. Bookings made inside the window are skipped: their confirmation email
   * already arrived close to the start, so a second email would only be noise.
   */
  async enqueueDueReminders(
    now = new Date(),
    leadHours = ENV.BOOKING_REMINDER_HOURS,
  ): Promise<number> {
    const leadMs = leadHours * 3_600_000;
    const candidates = await this.db.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        userId: { not: null },
        startTime: { gt: now, lte: new Date(now.getTime() + leadMs) },
        emailOutbox: { none: { kind: 'BOOKING_REMINDER' } },
      },
      select: { id: true, startTime: true, createdAt: true },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      take: REMINDER_ENQUEUE_LIMIT,
    });
    const due = candidates.filter(
      (booking) => booking.createdAt.getTime() <= booking.startTime.getTime() - leadMs,
    );
    if (due.length === 0) return 0;
    const created = await this.db.emailOutbox.createMany({
      data: due.map((booking) => ({ kind: 'BOOKING_REMINDER' as const, bookingId: booking.id })),
      skipDuplicates: true,
    });
    return created.count;
  }

  async processDue(now = new Date(), limit = BATCH_SIZE): Promise<ProcessResult> {
    const result: ProcessResult = { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 };
    const ids = await this.claimDue(now, limit);
    result.claimed = ids.length;
    if (ids.length === 0) return result;

    const rows = await this.db.emailOutbox.findMany({
      where: { id: { in: ids } },
      include: outboxInclude,
    });
    for (const row of rows) {
      let skipReason: string | null = null;
      if (!row.booking.user?.email) skipReason = 'NO_RECIPIENT';
      else if (!this.notification.canDeliver()) skipReason = 'SMTP_DISABLED';
      else if (
        row.kind === 'BOOKING_CONFIRMATION' &&
        row.booking.status === BookingStatus.CANCELLED
      ) {
        skipReason = 'BOOKING_CANCELLED';
      } else if (row.kind === 'BOOKING_REMINDER') {
        // Checked on every attempt, including admin retries: a reminder only goes out for a
        // booking that is still CONFIRMED and has not started yet.
        if (row.booking.status === BookingStatus.CANCELLED) skipReason = 'BOOKING_CANCELLED';
        else if (row.booking.status !== BookingStatus.CONFIRMED) skipReason = 'BOOKING_NOT_ACTIVE';
        else if (row.booking.startTime.getTime() <= now.getTime()) skipReason = 'REMINDER_EXPIRED';
      }
      if (skipReason) {
        await this.finish(row.id, { status: 'SKIPPED', lastError: skipReason });
        result.skipped++;
        continue;
      }

      // NotificationService logs a sanitized failure code (never the address or credentials).
      const delivered = await this.deliver(row).catch(() => false);
      if (delivered) {
        await this.finish(row.id, { status: 'SENT', sentAt: new Date(), lastError: null });
        result.sent++;
      } else if (row.attempts >= EMAIL_MAX_ATTEMPTS) {
        await this.finish(row.id, { status: 'FAILED', lastError: 'SMTP_ERROR' });
        result.failed++;
      } else {
        await this.finish(row.id, {
          lastError: 'SMTP_ERROR',
          nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(row.attempts)),
        });
        result.retried++;
      }
    }
    return result;
  }

  /** Runs one pass soon after a commit; no-op unless the worker was started (tests drive it). */
  kick(): void {
    if (!this.timer) return;
    this.tick();
  }

  private tick(): void {
    if (this.inFlight) return;
    const run = this.enqueueDueReminders()
      .catch((err: unknown) => {
        // A failed reminder scan must not stop delivery of already queued emails.
        const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : 'UNKNOWN';
        console.error(`[EmailOutbox] reminder scan failed; code=${code}`);
      })
      .then(() => this.processDue())
      .catch((err: unknown) => {
        const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : 'UNKNOWN';
        console.error(`[EmailOutbox] processing pass failed; code=${code}`);
        return null;
      })
      .finally(() => {
        this.inFlight = null;
      });
    this.inFlight = run as Promise<ProcessResult>;
    // Graceful shutdown waits for an in-flight pass instead of cutting an SMTP send short.
    trackBackgroundTask(run);
  }

  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref?.();
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async list(filter: EmailOutboxFilter) {
    const where: Prisma.EmailOutboxWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.bookingId ? { bookingId: filter.bookingId } : {}),
    };
    const [total, rows] = await this.db.$transaction([
      this.db.emailOutbox.count({ where }),
      this.db.emailOutbox.findMany({
        where,
        include: outboxInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
    ]);
    return {
      items: rows.map(toDto),
      pagination: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / filter.limit),
      },
    };
  }

  /** Requeues a FAILED or SKIPPED message with a fresh attempt budget. */
  async retry(id: string, now = new Date()): Promise<EmailOutboxDto> {
    const updated = await this.db.emailOutbox.updateMany({
      where: { id, status: { in: ['FAILED', 'SKIPPED'] } },
      data: { status: 'QUEUED', attempts: 0, nextAttemptAt: now, lastError: null },
    });
    const row = await this.db.emailOutbox.findUnique({ where: { id }, include: outboxInclude });
    if (!row) throw new AppError('EMAIL_NOT_FOUND', 'Không tìm thấy email trong hàng đợi', 404);
    if (updated.count === 0) {
      throw new AppError(
        'EMAIL_NOT_RETRYABLE',
        'Chỉ có thể gửi lại email ở trạng thái FAILED hoặc SKIPPED',
        409,
      );
    }
    this.kick();
    return toDto(row);
  }
}

export const emailOutboxService = new EmailOutboxService();
