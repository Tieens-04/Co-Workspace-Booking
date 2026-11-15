import { apiClient } from './api';
import { ApiResponse, PaginationMeta } from '../types/room';

export type EmailOutboxStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';
export type EmailOutboxKind =
  | 'BOOKING_CONFIRMATION'
  | 'BOOKING_CANCELLATION'
  | 'BOOKING_REMINDER'
  | 'BOOKING_RESCHEDULED'
  | 'PAYMENT_RECEIPT'
  | 'BOOKING_ROOM_UNAVAILABLE'
  | 'EMAIL_VERIFICATION';

/** Delivery record; the server never returns the recipient address. */
export interface EmailOutboxItem {
  id: string;
  kind: EmailOutboxKind;
  bookingId: string | null;
  bookingCode: string | null;
  status: EmailOutboxStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailOutboxQuery {
  page?: number;
  limit?: number;
  kind?: EmailOutboxKind;
  status?: EmailOutboxStatus;
}

export const adminEmailOutboxApi = {
  list: async (
    query: EmailOutboxQuery,
    signal?: AbortSignal,
  ): Promise<ApiResponse<{ items: EmailOutboxItem[]; pagination: PaginationMeta }>> => {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
    );
    const response = await apiClient.get<
      ApiResponse<{ items: EmailOutboxItem[]; pagination: PaginationMeta }>
    >('/admin/email-outbox', { params, signal });
    return response.data;
  },

  retry: async (id: string): Promise<ApiResponse<EmailOutboxItem>> => {
    const response = await apiClient.post<ApiResponse<EmailOutboxItem>>(
      `/admin/email-outbox/${id}/retry`,
    );
    return response.data;
  },
};
