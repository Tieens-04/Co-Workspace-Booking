import { BookingStatus, PaymentStatus, PaymentMethod, Role } from '@prisma/client';

export const BLOCKING_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.CONFIRMED,
] as const;

export interface BookingRoomDto {
  id: string;
  name: string;
}

/** CWB-89: bank transfer details shown on CONFIRMED + UNPAID bookings when configured. */
export interface PaymentInstructionsDto {
  bankName: string;
  accountNumber: string;
  accountName: string;
  /** Transfer content customers must use: the booking code. */
  transferContent: string;
  /** Server-calculated total, decimal string. */
  amount: string;
}

export interface BookingResponseDto {
  id: string;
  bookingCode: string;
  room: BookingRoomDto;
  startTime: Date;
  endTime: Date;
  checkedInAt: Date | null;
  attendanceTrackingEnabled: boolean;
  totalAmount: string;
  note: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  paidAt?: Date | null;
  paymentInstructions?: PaymentInstructionsDto | null;
  cancellationReason?: string | null;
  cancelledAt?: Date | null;
  cancelledBy?: Role | null;
  refundedAmount?: string;
  isNewlyCancelled?: boolean;
}

export interface FutureBookingWarningItem {
  bookingCode: string;
  startTime: string;
  endTime: string;
}

export interface FutureBookingWarningDetails {
  /** Includes ongoing and upcoming blocking bookings; legacy API name retained. */
  futureBookingCount: number;
  bookings: FutureBookingWarningItem[];
}

export type BookingHistoryView = 'ALL' | 'UPCOMING' | 'COMPLETED';

export interface FindUserBookingsFilter {
  page: number;
  limit: number;
  view: BookingHistoryView;
}

export interface GetBookingsResponseData {
  items: BookingResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
