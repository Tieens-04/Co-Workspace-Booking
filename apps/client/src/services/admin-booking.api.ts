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
  AdminCompleteBookingApiResponse,
  AdminNoShowBookingApiResponse,
  GetAdminRevenueParams,
  AdminRevenueApiResponse,
} from '../types/admin-booking';

export const adminBookingApi = {
  checkInBooking: async (
    bookingId: string,
    signal?: AbortSignal,
  ): Promise<AdminCompleteBookingApiResponse> => {
    const response = await apiClient.patch<AdminCompleteBookingApiResponse>(
      `/admin/bookings/${bookingId}/check-in`,
      {},
      { signal },
    );
    return response.data;
  },
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

  completeBooking: async (
    bookingId: string,
    signal?: AbortSignal,
  ): Promise<AdminCompleteBookingApiResponse> => {
    const response = await apiClient.patch<AdminCompleteBookingApiResponse>(
      `/admin/bookings/${bookingId}/complete`,
      {},
      {
        signal,
      },
    );
    return response.data;
  },

  markNoShow: async (
    bookingId: string,
    signal?: AbortSignal,
  ): Promise<AdminNoShowBookingApiResponse> => {
    const response = await apiClient.patch<AdminNoShowBookingApiResponse>(
      `/admin/bookings/${bookingId}/no-show`,
      {},
      {
        signal,
      },
    );
    return response.data;
  },

  getRevenue: async (
    params?: GetAdminRevenueParams,
    signal?: AbortSignal,
  ): Promise<AdminRevenueApiResponse> => {
    const response = await apiClient.get<AdminRevenueApiResponse>('/admin/revenue', {
      params,
      signal,
    });
    return response.data;
  },
};
