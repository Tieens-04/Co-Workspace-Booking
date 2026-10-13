import { apiClient } from './api';
import {
  GetAdminBookingsParams,
  AdminBookingsApiResponse,
  CreateGuestBookingPayload,
  AdminGuestBookingApiResponse,
  ConfirmPaymentPayload,
  ConfirmPaymentApiResponse,
  AdminCancelBookingPayload,
  AdminCancelBookingApiResponse,
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

  confirmPayment: async (
    bookingId: string,
    payload: ConfirmPaymentPayload,
    signal?: AbortSignal,
  ): Promise<ConfirmPaymentApiResponse> => {
    const response = await apiClient.patch<ConfirmPaymentApiResponse>(
      `/admin/bookings/${bookingId}/payment`,
      payload,
      {
        signal,
      },
    );
    return response.data;
  },

  cancelBooking: async (
    bookingId: string,
    payload: AdminCancelBookingPayload,
    signal?: AbortSignal,
  ): Promise<AdminCancelBookingApiResponse> => {
    const response = await apiClient.patch<AdminCancelBookingApiResponse>(
      `/admin/bookings/${bookingId}/cancel`,
      payload,
      {
        signal,
      },
    );
    return response.data;
  },
};
