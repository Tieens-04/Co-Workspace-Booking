import { EmailOutboxKind, Prisma } from '@prisma/client';

/**
 * Queues a booking email inside the caller's transaction so it commits or rolls back with the
 * booking change. The (kind, booking) unique key makes repeated enqueues a no-op, so retries and
 * idempotent cancellations never queue a second email for the same event.
 */
export async function enqueueBookingEmail(
  tx: Prisma.TransactionClient,
  kind: EmailOutboxKind,
  bookingId: string,
): Promise<void> {
  await tx.emailOutbox.createMany({ data: [{ kind, bookingId }], skipDuplicates: true });
}
