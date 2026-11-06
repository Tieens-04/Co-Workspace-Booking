import { apiClient } from './api';
import { ApiResponse, PaginationMeta } from '../types/room';

export type AccountStatus = 'ACTIVE' | 'LOCKED';
export type AccountRole = 'CUSTOMER' | 'ADMIN';

/** Admin view of an account (CWB-79); the server never returns password data. */
export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: AccountRole;
  status: AccountStatus;
  lockedAt: string | null;
  lockReason: string | null;
  createdAt: string;
  bookingCount: number;
  noShowCount: number;
  upcomingBookingCount: number;
  lastBookingAt: string | null;
}

export interface AffectedBooking {
  id: string;
  bookingCode: string;
  roomName: string;
  startTime: string;
  endTime: string;
}

export interface AdminUserQuery {
  page?: number;
  limit?: number;
  q?: string;
  role?: AccountRole;
  status?: AccountStatus;
}

export const adminUserApi = {
  list: async (
    query: AdminUserQuery,
    signal?: AbortSignal,
  ): Promise<ApiResponse<{ items: AdminUserItem[]; pagination: PaginationMeta }>> => {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
    );
    const response = await apiClient.get<
      ApiResponse<{ items: AdminUserItem[]; pagination: PaginationMeta }>
    >('/admin/users', { params, signal });
    return response.data;
  },

  updateStatus: async (
    id: string,
    status: AccountStatus,
    reason: string,
  ): Promise<ApiResponse<{ user: AdminUserItem; affectedBookings: AffectedBooking[] }>> => {
    const response = await apiClient.patch<
      ApiResponse<{ user: AdminUserItem; affectedBookings: AffectedBooking[] }>
    >(`/admin/users/${id}/status`, { status, reason });
    return response.data;
  },
};
