import { apiClient } from './api';
import {
  GetAdminBookingsParams,
  AdminBookingsApiResponse,
  CreateGuestBookingPayload,
  AdminGuestBookingApiResponse,
} from '../types/admin-booking';

export const adminBookingApi = {
  getBookings: async (
    params?: GetAdminBookingsParams,
    signal?: AbortSignal,
  ): Promise<AdminBookingsApiResponse> => {
    const response = await apiClient.get<AdminBookingsApiResponse>('/admin/bookings', {
      params,
      signal,
    });
    return response.data;
  },

  createGuestBooking: async (
    payload: CreateGuestBookingPayload,
    signal?: AbortSignal,
  ): Promise<AdminGuestBookingApiResponse> => {
    const response = await apiClient.post<AdminGuestBookingApiResponse>(
      '/admin/bookings/guest',
      payload,
      {
        signal,
      },
    );
    return response.data;
  },
};
