import { apiClient } from './api';
import { ApiResponse, PaginationMeta } from '../types/room';

export const AUDIT_ACTION_LABELS = {
  BOOKING_RESCHEDULED: 'Đổi lịch đặt phòng',
  BOOKING_GUEST_CREATED: 'Tạo đặt phòng khách vãng lai',
  BOOKING_PAYMENT_CONFIRMED: 'Xác nhận thanh toán',
  BOOKING_CANCELLED_BY_ADMIN: 'Hủy đặt phòng',
  BOOKING_CHECKED_IN: 'Check-in',
  BOOKING_COMPLETED: 'Hoàn tất đặt phòng',
  BOOKING_MARKED_NO_SHOW: 'Đánh dấu không đến',
  BOOKING_REFUNDED: 'Hoàn tiền đặt phòng',
  ROOM_STATUS_CHANGED: 'Đổi trạng thái phòng',
  USER_LOCKED: 'Khóa tài khoản',
  USER_UNLOCKED: 'Mở khóa tài khoản',
  CLOSURE_CREATED: 'Tạo khung đóng cửa',
  CLOSURE_UPDATED: 'Cập nhật khung đóng cửa',
  CLOSURE_DELETED: 'Xóa khung đóng cửa',
} as const;

export type AuditAction = keyof typeof AUDIT_ACTION_LABELS;
export type AuditEntityType = 'BOOKING' | 'ROOM' | 'USER' | 'CLOSURE';

export interface AuditEvent {
  id: string;
  actorId: string;
  actorRole: 'ADMIN' | 'CUSTOMER';
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditEventQuery {
  page?: number;
  limit?: number;
  entityType?: AuditEntityType;
  entityId?: string;
  action?: AuditAction;
}

export const adminAuditApi = {
  list: async (
    query: AuditEventQuery,
    signal?: AbortSignal,
  ): Promise<ApiResponse<{ items: AuditEvent[]; pagination: PaginationMeta }>> => {
    // Only send filters that are set; the server rejects unknown or empty fields.
    const params = Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
    );
    const response = await apiClient.get<
      ApiResponse<{ items: AuditEvent[]; pagination: PaginationMeta }>
    >('/admin/audit-events', { params, signal });
    return response.data;
  },
};
