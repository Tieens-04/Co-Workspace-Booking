import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';

interface GroupableBooking {
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalAmount: Prisma.Decimal;
}

/**
 * In-memory equivalent of `booking.groupBy({ by: ['status', 'paymentStatus'], _count: { _all },
 * _sum: { totalAmount } })` so repository unit tests can keep describing data as booking rows.
 */
export function groupBookingsByStatusAndPayment(rows: readonly GroupableBooking[]) {
  const groups = new Map<
    string,
    {
      status: BookingStatus;
      paymentStatus: PaymentStatus;
      _count: { _all: number };
      _sum: { totalAmount: Prisma.Decimal | null };
    }
  >();
  for (const row of rows) {
    const key = `${row.status}:${row.paymentStatus}`;
    const group = groups.get(key) ?? {
      status: row.status,
      paymentStatus: row.paymentStatus,
      _count: { _all: 0 },
      _sum: { totalAmount: new Prisma.Decimal(0) },
    };
    group._count._all += 1;
    group._sum.totalAmount = group._sum.totalAmount!.add(row.totalAmount);
    groups.set(key, group);
  }
  return [...groups.values()];
}
