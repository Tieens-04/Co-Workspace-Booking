import { BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { BookingRoomDto } from './booking.type.js';

export type AdminCustomerKind = 'USER' | 'GUEST';

export interface AdminBookingCustomerDto {
  kind: AdminCustomerKind;
  name: string;
  phone: string | null;
}

export interface AdminBookingResponseDto {
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
  customer: AdminBookingCustomerDto;
}

export interface FindAdminBookingsFilter {
  page: number;
  limit: number;
  bookingCode?: string;
  date?: string;
  status?: BookingStatus;
}

export interface AdminBookingListResponseData {
  items: AdminBookingResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
