import { BookingStatus, PaymentStatus, PaymentMethod, Role } from '@prisma/client';

export const BLOCKING_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.CONFIRMED,
] as const;

export interface BookingRoomDto {
  id: string;
  name: string;
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
