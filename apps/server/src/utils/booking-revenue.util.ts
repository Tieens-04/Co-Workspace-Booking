import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';

interface RevenueBooking {
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalAmount: Prisma.Decimal;
}

/** Cancellation releases the room; it does not refund money already collected. */
export function summarizeBookingRevenue(bookings: readonly RevenueBooking[]) {
  let actual = new Prisma.Decimal(0);
  let unpaid = new Prisma.Decimal(0);
  let paidBookings = 0;
  let unpaidBookings = 0;
  let cancelledBookings = 0;

  for (const booking of bookings) {
    if (booking.status === BookingStatus.CANCELLED) cancelledBookings += 1;
    if (booking.paymentStatus === PaymentStatus.PAID) {
      actual = actual.add(booking.totalAmount);
      paidBookings += 1;
    } else if (booking.status !== BookingStatus.CANCELLED) {
      unpaid = unpaid.add(booking.totalAmount);
      unpaidBookings += 1;
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
