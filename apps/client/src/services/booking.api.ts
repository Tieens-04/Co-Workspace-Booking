import { apiClient } from './api';
import {
  CreateBookingPayload,
  CreateBookingResponse,
  GetBookingsParams,
  GetBookingsResponse,
  GetBookingDetailResponse,
  RescheduleBookingPayload,
  RescheduleBookingResponse,
} from '../types/booking';

export const bookingApi = {
  createBooking: async (
    payload: CreateBookingPayload,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<CreateBookingResponse> => {
    const response = await apiClient.post<CreateBookingResponse>('/bookings', payload, {
      signal,
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
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

  rescheduleBooking: async (
    id: string,
    payload: RescheduleBookingPayload,
    signal?: AbortSignal,
  ): Promise<RescheduleBookingResponse> => {
    const response = await apiClient.patch<RescheduleBookingResponse>(
      `/bookings/${id}`,
      payload,
      {
        signal,
      },
    );
    return response.data;
  },

  cancelBooking: async (id: string, signal?: AbortSignal): Promise<GetBookingDetailResponse> => {
    const response = await apiClient.patch<GetBookingDetailResponse>(
      `/bookings/${id}/cancel`,
      undefined,
      {
        signal,
      },
    );
    return response.data;
  },
};
