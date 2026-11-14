import { EmailOutboxKind, Prisma } from '@prisma/client';

/**
 * Queues a booking email inside the caller's transaction so it commits or rolls back with the
 * booking change. The (kind, booking_id, event_key) unique key makes repeated enqueues a no-op, so
 * retries and idempotent cancellations never queue a second email for the same event.
 */
export async function enqueueBookingEmail(
  tx: Prisma.TransactionClient,
  kind: EmailOutboxKind,
  bookingId: string,
): Promise<void> {
  await tx.emailOutbox.createMany({ data: [{ kind, bookingId }], skipDuplicates: true });
}

export async function enqueueBookingUnavailableEmails(
  tx: Prisma.TransactionClient,
  bookingIds: readonly string[],
  eventKey: string,
): Promise<void> {
  if (bookingIds.length === 0) {
    return;
  }

  const uniqueBookingIds = Array.from(new Set(bookingIds));
  await tx.emailOutbox.createMany({
    data: uniqueBookingIds.map((bookingId) => ({
      kind: 'BOOKING_ROOM_UNAVAILABLE' as const,
      bookingId,
      eventKey,
    })),
    skipDuplicates: true,
  });
}

export async function requeueClosureUnavailableEmails(
  tx: Prisma.TransactionClient,
  eventKey: string,
  allAffectedBookingIds: readonly string[],
  newlyAffectedBookingIds: readonly string[],
  now: Date,
): Promise<void> {
  const orClauses: Prisma.EmailOutboxWhereInput[] = [];
  if (allAffectedBookingIds.length > 0) {
    orClauses.push({
      bookingId: { in: Array.from(new Set(allAffectedBookingIds)) },
      status: 'SKIPPED',
    });
  }
  if (newlyAffectedBookingIds.length > 0) {
    orClauses.push({
      bookingId: { in: Array.from(new Set(newlyAffectedBookingIds)) },
      status: { not: 'QUEUED' },
    });
  }
  if (orClauses.length === 0) {
    return;
  }

  await tx.emailOutbox.updateMany({
    where: {
      kind: 'BOOKING_ROOM_UNAVAILABLE',
      eventKey,
      OR: orClauses,
    },
    data: {
      status: 'QUEUED',
      attempts: 0,
      nextAttemptAt: now,
      lastError: null,
      sentAt: null,
    },
  });
}

/**
 * Queues an account-level email (such as EMAIL_VERIFICATION) inside the caller's transaction.
 */
export async function enqueueAccountEmail(
  tx: Prisma.TransactionClient,
  kind: EmailOutboxKind,
  userId: string,
): Promise<void> {
  await tx.emailOutbox.create({ data: { kind, userId } });
}
