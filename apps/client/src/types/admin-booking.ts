import { ApiResponse, PaginationMeta } from './room';
import type { BookingRoomUnavailableCause } from './booking';

export type AdminCustomerKind = 'USER' | 'GUEST';

export interface AdminBookingCustomer {
  kind: AdminCustomerKind;
  name: string;
  phone: string | null;
  email?: string | null;
  id?: string | null;
}

export interface AdminBookingItem {
  id: string;
  bookingCode: string;
  room: {
    id: string;
    name: string;
  };
  startTime: string;
  endTime: string;
  checkedInAt: string | null;
  attendanceTrackingEnabled: boolean;
  totalAmount: string;
  note: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  cancellationReason?: string | null;
  refundedAmount?: string;
  refunds?: AdminRefundItem[];
  roomUnavailable?: boolean;
  roomUnavailableReason?: string | null;
  roomUnavailableCause?: BookingRoomUnavailableCause | null;
  customer: AdminBookingCustomer;
}

export const ADMIN_BOOKING_STATUSES = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

export const ADMIN_PAYMENT_STATUSES = ['UNPAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

export type AdminBookingStatus = (typeof ADMIN_BOOKING_STATUSES)[number];
export type AdminPaymentStatus = (typeof ADMIN_PAYMENT_STATUSES)[number];

export interface GetAdminBookingsParams {
  page?: number;
  limit?: number;
  bookingCode?: string;
  date?: string;
  from?: string;
  to?: string;
  roomId?: string;
  status?: AdminBookingStatus;
  paymentStatus?: AdminPaymentStatus;
  /** CWB-79: account email/name/phone or walk-in guest name/phone. */
  customer?: string;
  /** CWB-91: filter CONFIRMED bookings affected by closure or unavailable room. */
  needsAttention?: boolean;
  /** CWB-100: filter CANCELLED bookings with PAID or PARTIALLY_REFUNDED status. */
  needsRefund?: boolean;
}

export interface AdminBookingListResponseData {
  items: AdminBookingItem[];
  pagination: PaginationMeta;
}

export interface CreateGuestBookingPayload {
  roomId: string;
  startTime: string;
  endTime: string;
  guestName: string;
  guestPhone: string;
  note?: string | null;
}

export interface CreateAdminCustomerBookingPayload {
  customerId: string;
  roomId: string;
  startTime: string;
  endTime: string;
  note?: string | null;
}

export interface ConfirmPaymentPayload {
  paymentMethod: 'CASH' | 'QR';
}

export interface AdminCancelBookingPayload {
  reason: string;
}

export interface AdminRescheduleBookingPayload {
  startTime: string;
  endTime: string;
  roomId?: string;
  reason: string;
  note?: string | null;
  acknowledgePriceDelta?: boolean;
}

export type AdminBookingsApiResponse = ApiResponse<AdminBookingListResponseData>;
export type AdminGuestBookingApiResponse = ApiResponse<AdminBookingItem>;
export type ConfirmPaymentApiResponse = ApiResponse<AdminBookingItem>;
export type AdminCancelBookingApiResponse = ApiResponse<AdminBookingItem>;
export type AdminCompleteBookingApiResponse = ApiResponse<AdminBookingItem>;
export type AdminNoShowBookingApiResponse = ApiResponse<AdminBookingItem>;
export type AdminRescheduleBookingApiResponse = ApiResponse<AdminBookingItem>;

export interface AdminRevenueData {
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

export interface GetAdminRevenueParams {
  startDate?: string;
  endDate?: string;
  roomId?: string;
}

export type AdminRevenueApiResponse = ApiResponse<AdminRevenueData>;

export interface AdminRefundItem {
  id: string;
  amount: string;
  method: 'CASH' | 'QR';
  reason: string;
  actorId: string;
  createdAt: string;
}

export interface RefundBookingPayload {
  amount: number | string;
  method: 'CASH' | 'QR';
  reason: string;
}

export type AdminRefundBookingApiResponse = ApiResponse<AdminBookingItem>;
