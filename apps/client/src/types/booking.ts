import { ApiResponse } from './room';

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
  note: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
}

export type CreateBookingResponse = ApiResponse<BookingResult>;
