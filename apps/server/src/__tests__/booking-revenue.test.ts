import { describe, expect, it } from 'vitest';
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import { summarizeBookingRevenue } from '../utils/booking-revenue.util.js';

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
