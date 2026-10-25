import { BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { BookingRoomDto } from './booking.type.js';

export type AdminCustomerKind = 'USER' | 'GUEST';

// Public admin projection: USER includes account email/id; GUEST omits both.
export interface AdminBookingCustomerDto {
  kind: AdminCustomerKind;
  name: string;
  phone: string | null;
  email?: string | null;
  id?: string | null;
}

export interface AdminBookingResponseDto {
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
  isNewlyCancelled?: boolean;
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

export interface RevenuePeriodFilter {
  startDate?: string;
  endDate?: string;
  roomId?: string;
}

export interface AdminRevenueResponseDto {
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  actualRevenue: string;
  potentialRevenue: string;
  unpaidRevenue: string;
  totalBookings: number;
  paidBookings: number;
  unpaidBookings: number;
  cancelledBookings: number;
}
