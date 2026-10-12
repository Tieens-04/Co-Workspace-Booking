import { ApiResponse, PaginationMeta } from './room';

export type AdminCustomerKind = 'USER' | 'GUEST';

export interface AdminBookingCustomer {
  kind: AdminCustomerKind;
  name: string;
  phone: string | null;
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
  totalAmount: string;
  note: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
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

export type AdminBookingsApiResponse = ApiResponse<AdminBookingListResponseData>;
export type AdminGuestBookingApiResponse = ApiResponse<AdminBookingItem>;
