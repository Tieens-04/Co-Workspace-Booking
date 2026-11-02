import { describe, expect, it } from 'vitest';
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import {
  summarizeBookingRevenue,
  summarizeRevenueGroups,
  toRevenueGroups,
} from '../utils/booking-revenue.util.js';

describe('Booking revenue policy', () => {
  for (const status of Object.values(BookingStatus)) {
    for (const paymentStatus of Object.values(PaymentStatus)) {
      it(`${status}/${paymentStatus} follows the collected-money policy`, () => {
        const paid = paymentStatus === PaymentStatus.PAID;
        const outstanding = !paid && status !== BookingStatus.CANCELLED;
        expect(
          summarizeBookingRevenue([
            { status, paymentStatus, totalAmount: new Prisma.Decimal('100.10') },
          ]),
        ).toEqual({
          actualRevenue: paid ? '100.10' : '0.00',
          unpaidRevenue: outstanding ? '100.10' : '0.00',
          potentialRevenue: paid || outstanding ? '100.10' : '0.00',
          paidBookings: paid ? 1 : 0,
          unpaidBookings: outstanding ? 1 : 0,
          cancelledBookings: status === BookingStatus.CANCELLED ? 1 : 0,
        });
      });
    }
  }

  it('returns zero totals for no bookings', () => {
    expect(summarizeBookingRevenue([])).toEqual({
      actualRevenue: '0.00',
      unpaidRevenue: '0.00',
      potentialRevenue: '0.00',
      paidBookings: 0,
      unpaidBookings: 0,
      cancelledBookings: 0,
    });
  });

  it('adds decimal amounts exactly and preserves actual + unpaid = potential', () => {
    const summary = summarizeBookingRevenue([
      {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.PAID,
        totalAmount: new Prisma.Decimal('0.10'),
      },
      {
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        totalAmount: new Prisma.Decimal('0.20'),
      },
      {
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: new Prisma.Decimal('9999999999.99'),
      },
    ]);
    expect(summary.actualRevenue).toBe('0.30');
    expect(summary.potentialRevenue).toBe('10000000000.29');
    expect(new Prisma.Decimal(summary.actualRevenue).add(summary.unpaidRevenue).toFixed(2)).toBe(
      summary.potentialRevenue,
    );
  });
});

describe('Aggregated revenue groups (CWB-57)', () => {
  it('matches the row-by-row result when counts and sums come from groupBy', () => {
    const rows = [
      [BookingStatus.CONFIRMED, PaymentStatus.UNPAID, '10.05'],
      [BookingStatus.CONFIRMED, PaymentStatus.UNPAID, '20.10'],
      [BookingStatus.COMPLETED, PaymentStatus.PAID, '100.00'],
      [BookingStatus.CANCELLED, PaymentStatus.PAID, '33.33'],
      [BookingStatus.CANCELLED, PaymentStatus.UNPAID, '50.00'],
      [BookingStatus.NO_SHOW, PaymentStatus.UNPAID, '77.77'],
    ].map(([status, paymentStatus, amount]) => ({
      status: status as BookingStatus,
      paymentStatus: paymentStatus as PaymentStatus,
      totalAmount: new Prisma.Decimal(amount),
    }));
    const grouped = new Map<
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
      const group = grouped.get(key) ?? {
        status: row.status,
        paymentStatus: row.paymentStatus,
        _count: { _all: 0 },
        _sum: { totalAmount: new Prisma.Decimal(0) },
      };
      group._count._all += 1;
      group._sum.totalAmount = group._sum.totalAmount!.add(row.totalAmount);
      grouped.set(key, group);
    }

    expect(summarizeRevenueGroups(toRevenueGroups([...grouped.values()]))).toEqual(
      summarizeBookingRevenue(rows),
    );
  });

  it('treats a null aggregate sum as zero', () => {
    expect(
      summarizeRevenueGroups([
        {
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
          count: 2,
          totalAmount: null,
        },
      ]),
    ).toMatchObject({ unpaidRevenue: '0.00', unpaidBookings: 2, potentialRevenue: '0.00' });
  });
});
