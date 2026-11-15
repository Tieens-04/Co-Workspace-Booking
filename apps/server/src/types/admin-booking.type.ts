import { BookingStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { BookingRoomDto, BookingRoomUnavailableCause } from './booking.type.js';

export interface AdminRefundDto {
  id: string;
  amount: string;
  method: PaymentMethod;
  reason: string;
  actorId: string;
  createdAt: Date;
}

export interface RecordRefundRepoInput {
  amount: number | string;
  method: PaymentMethod;
  reason: string;
}

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
  cancelledAt?: Date | null;
  cancelledBy?: Role | null;
  refundedAmount: string;
  refunds?: AdminRefundDto[];
  isNewlyCancelled?: boolean;
  roomUnavailable?: boolean;
  roomUnavailableReason?: string | null;
  roomUnavailableCause?: BookingRoomUnavailableCause | null;
  customer: AdminBookingCustomerDto;
}

export interface FindAdminBookingsFilter {
  page: number;
  limit: number;
  bookingCode?: string;
  date?: string;
  status?: BookingStatus;
  /** CWB-79: substring of the account email/name/phone or the guest name/phone. */
  customer?: string;
  /** CWB-91: filter CONFIRMED bookings impacted by closure or non-AVAILABLE room. */
  needsAttention?: boolean;
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
