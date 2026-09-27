import { apiClient } from './api';
import {
  CreateBookingPayload,
  CreateBookingResponse,
  GetBookingsParams,
  GetBookingsResponse,
  GetBookingDetailResponse,
} from '../types/booking';

export const bookingApi = {
  createBooking: async (
    payload: CreateBookingPayload,
    signal?: AbortSignal,
  ): Promise<CreateBookingResponse> => {
    const response = await apiClient.post<CreateBookingResponse>('/bookings', payload, {
      signal,
    });
    return response.data;
  },

  getBookings: async (
    params?: GetBookingsParams,
    signal?: AbortSignal,
  ): Promise<GetBookingsResponse> => {
    const response = await apiClient.get<GetBookingsResponse>('/bookings', {
      params,
      signal,
    });
    return response.data;
  },

  getBookingById: async (id: string, signal?: AbortSignal): Promise<GetBookingDetailResponse> => {
    const response = await apiClient.get<GetBookingDetailResponse>(`/bookings/${id}`, {
      signal,
    });
    return response.data;
  },
};
