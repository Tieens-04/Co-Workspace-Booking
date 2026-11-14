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

export type BookingRoomUnavailableCause = 'CLOSURE' | 'ROOM_MAINTENANCE' | 'ROOM_ARCHIVED';

/** CWB-89: bank transfer details for a CONFIRMED + UNPAID booking (server-calculated amount). */
export interface PaymentInstructions {
  bankName: string;
  accountNumber: string;
  accountName: string;
  transferContent: string;
  amount: string;
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
  paidAt?: string | null;
  paymentInstructions?: PaymentInstructions | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: 'CUSTOMER' | 'ADMIN' | null;
  refundedAmount?: string;
  roomUnavailable?: boolean;
  roomUnavailableReason?: string | null;
  roomUnavailableCause?: BookingRoomUnavailableCause | null;
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
export interface RescheduleBookingPayload {
  startTime: string;
  endTime: string;
  roomId?: string;
  note?: string | null;
}

export type RescheduleBookingResponse = ApiResponse<BookingResult>;
