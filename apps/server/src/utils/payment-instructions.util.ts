import { BookingStatus, PaymentStatus } from '@prisma/client';
import type { PaymentAccount } from '../config/payment.config.js';
import type { PaymentInstructionsDto } from '../types/booking.type.js';

/**
 * CWB-89: bank transfer details for a CONFIRMED, UNPAID booking. The transfer content is the
 * booking code and the amount is the server-calculated total, so staff can match the transfer.
 * Confirming the payment stays a manual admin action.
 */
export function paymentInstructionsFor(
  booking: {
    bookingCode: string;
    totalAmount: string;
    status: BookingStatus;
    paymentStatus: PaymentStatus;
  },
  account: PaymentAccount | null,
): PaymentInstructionsDto | null {
  if (!account) return null;
  if (booking.status !== BookingStatus.CONFIRMED) return null;
  if (booking.paymentStatus !== PaymentStatus.UNPAID) return null;
  return {
    bankName: account.bankName,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    transferContent: booking.bookingCode,
    amount: booking.totalAmount,
  };
}
