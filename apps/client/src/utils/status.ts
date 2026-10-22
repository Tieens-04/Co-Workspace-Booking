/**
 * Single source of truth for status labels and their visual tone.
 * Tones map to the --status-* design tokens (see StatusBadge / DESIGN.md).
 */
export type StatusTone =
  'confirmed' | 'success' | 'cancelled' | 'noshow' | 'unpaid' | 'maintenance' | 'neutral';

export type StatusKind = 'booking' | 'payment' | 'room';

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

export const BOOKING_STATUS_META: Record<string, StatusMeta> = {
  CONFIRMED: { label: 'Đã xác nhận', tone: 'confirmed' },
  COMPLETED: { label: 'Đã hoàn tất', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'cancelled' },
  NO_SHOW: { label: 'Không đến', tone: 'noshow' },
};

export const PAYMENT_STATUS_META: Record<string, StatusMeta> = {
  UNPAID: { label: 'Chưa thanh toán', tone: 'unpaid' },
  PAID: { label: 'Đã thanh toán', tone: 'success' },
};

export const ROOM_STATUS_META: Record<string, StatusMeta> = {
  AVAILABLE: { label: 'Sẵn sàng', tone: 'success' },
  MAINTENANCE: { label: 'Bảo trì', tone: 'maintenance' },
};

const META_BY_KIND: Record<StatusKind, Record<string, StatusMeta>> = {
  booking: BOOKING_STATUS_META,
  payment: PAYMENT_STATUS_META,
  room: ROOM_STATUS_META,
};

/** Unknown statuses fall back to a neutral tone showing the raw value. */
export function getStatusMeta(kind: StatusKind, status: string): StatusMeta {
  return META_BY_KIND[kind][status] ?? { label: status, tone: 'neutral' };
}

export function getPaymentMethodLabel(method: string | null): string {
  if (!method) return 'Chưa có';
  if (method === 'CASH') return 'Tiền mặt';
  if (method === 'QR') return 'Chuyển khoản QR';
  return method;
}
