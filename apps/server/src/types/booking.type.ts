import { BookingStatus, PaymentStatus, PaymentMethod } from '@prisma/client';

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
  totalAmount: string;
  note: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
}

export interface FutureBookingWarningItem {
  bookingCode: string;
  startTime: string;
  endTime: string;
}

export interface FutureBookingWarningDetails {
  futureBookingCount: number;
  bookings: FutureBookingWarningItem[];
}
