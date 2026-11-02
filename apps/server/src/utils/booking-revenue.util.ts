import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';

interface RevenueBooking {
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalAmount: Prisma.Decimal;
}

/** One row of `booking.groupBy({ by: ['status', 'paymentStatus'] })` with count and amount sum. */
export interface RevenueGroup {
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  count: number;
  totalAmount: Prisma.Decimal | null;
}

/** Maps Prisma groupBy rows (`_count._all`, `_sum.totalAmount`) to revenue groups. */
export function toRevenueGroups(
  rows: ReadonlyArray<{
    status: BookingStatus;
    paymentStatus: PaymentStatus;
    _count: { _all: number };
    _sum: { totalAmount: Prisma.Decimal | null };
  }>,
): RevenueGroup[] {
  return rows.map((row) => ({
    status: row.status,
    paymentStatus: row.paymentStatus,
    count: row._count._all,
    totalAmount: row._sum.totalAmount,
  }));
}

/**
 * Revenue rules over DB-aggregated groups, so reports never load every booking into Node.
 * Cancellation releases the room; it does not refund money already collected.
 */
export function summarizeRevenueGroups(groups: readonly RevenueGroup[]) {
  let actual = new Prisma.Decimal(0);
  let unpaid = new Prisma.Decimal(0);
  let paidBookings = 0;
  let unpaidBookings = 0;
  let cancelledBookings = 0;

  for (const group of groups) {
    const amount = group.totalAmount ?? new Prisma.Decimal(0);
    if (group.status === BookingStatus.CANCELLED) cancelledBookings += group.count;
    if (group.paymentStatus === PaymentStatus.PAID) {
      actual = actual.add(amount);
      paidBookings += group.count;
    } else if (group.status !== BookingStatus.CANCELLED) {
      unpaid = unpaid.add(amount);
      unpaidBookings += group.count;
    }
  }

  return {
    actualRevenue: actual.toFixed(2),
    unpaidRevenue: unpaid.toFixed(2),
    potentialRevenue: actual.add(unpaid).toFixed(2),
    paidBookings,
    unpaidBookings,
    cancelledBookings,
  };
}

/** Same rules for already-loaded booking rows (one group per booking). */
export function summarizeBookingRevenue(bookings: readonly RevenueBooking[]) {
  return summarizeRevenueGroups(
    bookings.map((booking) => ({
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      count: 1,
      totalAmount: booking.totalAmount,
    })),
  );
}
