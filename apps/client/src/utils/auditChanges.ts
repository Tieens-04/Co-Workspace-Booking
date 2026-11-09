import type { AuditEvent } from '../services/admin-audit.api';
import { formatVnDate, formatVnTime } from './bookingTime';

const FIELD_LABELS: Record<string, string> = {
  bookingCode: 'Mã đặt phòng',
  status: 'Trạng thái',
  paymentStatus: 'Thanh toán',
  paymentMethod: 'Phương thức',
  checkedInAt: 'Check-in lúc',
  cancellationReason: 'Lý do hủy',
  roomId: 'Phòng',
  startTime: 'Bắt đầu',
  endTime: 'Kết thúc',
  totalAmount: 'Tổng tiền',
  acknowledgeFutureBookings: 'Xác nhận lịch đặt tương lai',
  reason: 'Lý do',
  acknowledgeConflictingBookings: 'Xác nhận lịch đặt trùng',
};

export const formatAuditTime = (iso: string) => {
  const date = new Date(iso);
  return `${formatVnDate(date)} ${formatVnTime(date)}`;
};

const display = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatAuditTime(value);
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  return String(value);
};

/** Fields whose value changed; a create (no `before`) lists every recorded field. */
export function describeChanges(event: Pick<AuditEvent, 'before' | 'after'>) {
  const before = event.before ?? {};
  const after = event.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((key) => event.before === null || before[key] !== after[key])
    .map((key) => ({
      key,
      label: FIELD_LABELS[key] ?? key,
      from: event.before === null ? null : display(before[key]),
      to: display(after[key]),
    }));
}
