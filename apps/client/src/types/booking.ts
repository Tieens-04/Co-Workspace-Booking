import { ApiResponse, PaginationMeta } from './room';

export interface CreateBookingPayload {
  roomId: string;
  startTime: string;
  endTime: string;
  note?: string | null;
}

export interface BookingRoomDto {
  id: string;
  name: string;
}

export interface BookingResult {
  id: string;
  bookingCode: string;
  room: BookingRoomDto;
  startTime: string;
  endTime: string;
  totalAmount: string;
  checkedInAt: string | null;
  attendanceTrackingEnabled: boolean;
  note: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
}

export type CreateBookingResponse = ApiResponse<BookingResult>;

export type BookingHistoryView = 'ALL' | 'UPCOMING' | 'COMPLETED';

export interface GetBookingsParams {
  page?: number;
  limit?: number;
  view?: BookingHistoryView;
}

export interface GetBookingsResponseData {
  items: BookingResult[];
  pagination: PaginationMeta;
}

export type GetBookingsResponse = ApiResponse<GetBookingsResponseData>;
export type GetBookingDetailResponse = ApiResponse<BookingResult>;
export type CancelBookingResponse = ApiResponse<BookingResult>;
