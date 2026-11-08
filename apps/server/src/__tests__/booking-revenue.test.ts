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
      it(`${status}/${paymentStatus} follows the collected-money policy without refunds`, () => {
        const isPaidCategory =
          paymentStatus === PaymentStatus.PAID ||
          paymentStatus === PaymentStatus.PARTIALLY_REFUNDED ||
          paymentStatus === PaymentStatus.REFUNDED;
        const outstanding = !isPaidCategory && status !== BookingStatus.CANCELLED;
        expect(
          summarizeBookingRevenue([
            { status, paymentStatus, totalAmount: new Prisma.Decimal('100.10') },
          ]),
        ).toEqual({
          actualRevenue: isPaidCategory ? '100.10' : '0.00',
          unpaidRevenue: outstanding ? '100.10' : '0.00',
          potentialRevenue: isPaidCategory || outstanding ? '100.10' : '0.00',
          paidBookings: isPaidCategory ? 1 : 0,
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

  it('correctly deducts refunded amount for PARTIALLY_REFUNDED bookings', () => {
    const summary = summarizeBookingRevenue([
      {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
        totalAmount: new Prisma.Decimal('100.00'),
        refundedAmount: new Prisma.Decimal('40.00'),
      },
    ]);
    expect(summary).toEqual({
      actualRevenue: '60.00',
      unpaidRevenue: '0.00',
      potentialRevenue: '60.00',
      paidBookings: 1,
      unpaidBookings: 0,
      cancelledBookings: 1,
    });
  });

  it('excludes 100% REFUNDED bookings from actual revenue and paidBookings count', () => {
    const summary = summarizeBookingRevenue([
      {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED,
        totalAmount: new Prisma.Decimal('100.00'),
        refundedAmount: new Prisma.Decimal('100.00'),
      },
    ]);
    expect(summary).toEqual({
      actualRevenue: '0.00',
      unpaidRevenue: '0.00',
      potentialRevenue: '0.00',
      paidBookings: 0,
      unpaidBookings: 0,
      cancelledBookings: 1,
    });
  });

  it('adds decimal amounts exactly and preserves actual + unpaid = potential with refunds', () => {
    const summary = summarizeBookingRevenue([
      {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
        totalAmount: new Prisma.Decimal('100.50'),
        refundedAmount: new Prisma.Decimal('30.25'),
      },
      {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED,
        totalAmount: new Prisma.Decimal('50.00'),
        refundedAmount: new Prisma.Decimal('50.00'),
      },
      {
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        totalAmount: new Prisma.Decimal('200.00'),
      },
      {
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: new Prisma.Decimal('300.00'),
      },
    ]);
    // Net: (100.50 - 30.25) + (50 - 50) + 200.00 = 70.25 + 200.00 = 270.25
    expect(summary.actualRevenue).toBe('270.25');
    expect(summary.unpaidRevenue).toBe('300.00');
    expect(summary.potentialRevenue).toBe('570.25');
    expect(summary.paidBookings).toBe(2); // 1 partial + 1 full paid
    expect(summary.unpaidBookings).toBe(1);
    expect(summary.cancelledBookings).toBe(2);
  });
});

describe('Aggregated revenue groups (CWB-57 & CWB-83)', () => {
  it('matches the row-by-row result when counts, total amounts and refunded amounts come from groupBy', () => {
    const rows = [
      {
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: new Prisma.Decimal('10.05'),
        refundedAmount: new Prisma.Decimal('0.00'),
      },
      {
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: new Prisma.Decimal('20.10'),
        refundedAmount: new Prisma.Decimal('0.00'),
      },
      {
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        totalAmount: new Prisma.Decimal('100.00'),
        refundedAmount: new Prisma.Decimal('0.00'),
      },
      {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
        totalAmount: new Prisma.Decimal('80.00'),
        refundedAmount: new Prisma.Decimal('30.00'),
      },
      {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED,
        totalAmount: new Prisma.Decimal('50.00'),
        refundedAmount: new Prisma.Decimal('50.00'),
      },
      {
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: new Prisma.Decimal('50.00'),
        refundedAmount: new Prisma.Decimal('0.00'),
      },
      {
        status: BookingStatus.NO_SHOW,
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: new Prisma.Decimal('77.77'),
        refundedAmount: new Prisma.Decimal('0.00'),
      },
    ];

    const grouped = new Map<
      string,
      {
        status: BookingStatus;
        paymentStatus: PaymentStatus;
        _count: { _all: number };
        _sum: { totalAmount: Prisma.Decimal | null; refundedAmount: Prisma.Decimal | null };
      }
    >();

    for (const row of rows) {
      const key = `${row.status}:${row.paymentStatus}`;
      const group = grouped.get(key) ?? {
        status: row.status,
        paymentStatus: row.paymentStatus,
        _count: { _all: 0 },
        _sum: {
          totalAmount: new Prisma.Decimal(0),
          refundedAmount: new Prisma.Decimal(0),
        },
      };
      group._count._all += 1;
      group._sum.totalAmount = group._sum.totalAmount!.add(row.totalAmount);
      group._sum.refundedAmount = group._sum.refundedAmount!.add(row.refundedAmount);
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
          refundedAmount: null,
        },
      ]),
    ).toMatchObject({ unpaidRevenue: '0.00', unpaidBookings: 2, potentialRevenue: '0.00' });
  });
});
