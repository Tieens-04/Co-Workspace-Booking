import { apiClient } from './api';
import { CreateBookingPayload, CreateBookingResponse } from '../types/booking';

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
};
