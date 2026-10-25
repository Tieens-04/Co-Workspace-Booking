import { ApiResponse, PaginationMeta } from './room';

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
  customer: AdminBookingCustomer;
}

export interface GetAdminBookingsParams {
  page?: number;
  limit?: number;
  bookingCode?: string;
  date?: string;
  status?: string;
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

export interface ConfirmPaymentPayload {
  paymentMethod: 'CASH' | 'QR';
}

export interface AdminCancelBookingPayload {
  reason: string;
}

export type AdminBookingsApiResponse = ApiResponse<AdminBookingListResponseData>;
export type AdminGuestBookingApiResponse = ApiResponse<AdminBookingItem>;
export type ConfirmPaymentApiResponse = ApiResponse<AdminBookingItem>;
export type AdminCancelBookingApiResponse = ApiResponse<AdminBookingItem>;
export type AdminCompleteBookingApiResponse = ApiResponse<AdminBookingItem>;
export type AdminNoShowBookingApiResponse = ApiResponse<AdminBookingItem>;

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
