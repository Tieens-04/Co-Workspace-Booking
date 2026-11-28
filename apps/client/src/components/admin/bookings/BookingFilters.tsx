import type * as React from 'react';
import { Search, X } from 'lucide-react';
import { Field } from '@/components/common/Field';
import { Checkbox, NativeSelect } from '@/components/common/NativeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ADMIN_BOOKING_STATUSES, ADMIN_PAYMENT_STATUSES } from '@/types/admin-booking';
import { RoomListItem } from '@/types/room';
import { BOOKING_STATUS_META, PAYMENT_STATUS_META, ROOM_STATUS_META } from '@/utils/status';

interface BookingFiltersProps {
  code: string;
  codeError?: string | null;
  customer: string;
  roomId: string;
  rooms: RoomListItem[];
  from: string;
  to: string;
  dateRangeError?: string | null;
  status: string;
  paymentStatus: string;
  needsAttention: boolean;
  needsRefund: boolean;
  onCodeChange: (value: string) => void;
  onCustomerChange: (value: string) => void;
  onRoomIdChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onPaymentStatusChange: (value: string) => void;
  onNeedsAttentionChange: (checked: boolean) => void;
  onNeedsRefundChange: (checked: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
}

/** Search bar for the admin bookings list. Draft values and submit logic live in the page. */
export function BookingFilters({
  code,
  codeError,
  customer,
  roomId,
  rooms,
  from,
  to,
  dateRangeError,
  status,
  paymentStatus,
  needsAttention,
  needsRefund,
  onCodeChange,
  onCustomerChange,
  onRoomIdChange,
  onFromChange,
  onToChange,
  onStatusChange,
  onPaymentStatusChange,
  onNeedsAttentionChange,
  onNeedsRefundChange,
  onSubmit,
  onClear,
}: BookingFiltersProps) {
  return (
    <section aria-label="Bộ lọc đặt phòng" className="rounded-xl border bg-card p-5">
      <form
        onSubmit={onSubmit}
        className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <Field
          id="filterBookingCode"
          label="Mã đặt phòng (tối thiểu 4 ký tự)"
          error={codeError ?? undefined}
          errorId="filter-code-error"
        >
          <Input
            type="text"
            className="tabular-nums"
            value={code}
            maxLength={191}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="VD: OU3Q hoặc CS-20261003-OU3Q"
            data-testid="filter-booking-code-input"
          />
        </Field>

        <Field id="filterCustomer" label="Khách hàng (email, tên, SĐT)">
          <Input
            type="search"
            value={customer}
            maxLength={191}
            onChange={(e) => onCustomerChange(e.target.value)}
            placeholder="Kể cả khách vãng lai"
            data-testid="filter-customer-input"
          />
        </Field>

        <Field id="filterRoom" label="Phòng">
          <NativeSelect
            value={roomId}
            onChange={(e) => onRoomIdChange(e.target.value)}
            data-testid="filter-room-select"
          >
            <option value="">-- Tất cả phòng --</option>
            {roomId && !rooms.some((r) => r.id === roomId) && (
              <option value={roomId}>Phòng đã chọn ({roomId.slice(0, 8)}…)</option>
            )}
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.status !== 'AVAILABLE' ? ` (${ROOM_STATUS_META[room.status].label})` : ''}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field id="filterStatus" label="Trạng thái đặt phòng">
          <NativeSelect
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            data-testid="filter-status-select"
          >
            <option value="">-- Tất cả trạng thái --</option>
            {ADMIN_BOOKING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {`${BOOKING_STATUS_META[value].label} (${value})`}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field id="filterPaymentStatus" label="Trạng thái thanh toán">
          <NativeSelect
            value={paymentStatus}
            onChange={(e) => onPaymentStatusChange(e.target.value)}
            data-testid="filter-payment-status-select"
          >
            <option value="">-- Tất cả thanh toán --</option>
            {ADMIN_PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {`${PAYMENT_STATUS_META[value].label} (${value})`}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field
          id="filterFrom"
          label="Từ ngày (giờ VN)"
          error={dateRangeError ?? undefined}
          errorId="filter-date-range-error"
        >
          <Input
            type="date"
            className="tabular-nums"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            data-testid="filter-from-input"
          />
        </Field>

        <Field id="filterTo" label="Đến ngày (giờ VN)">
          <Input
            type="date"
            className="tabular-nums"
            value={to}
            aria-invalid={dateRangeError ? true : undefined}
            aria-describedby={dateRangeError ? 'filter-date-range-error' : undefined}
            onChange={(e) => onToChange(e.target.value)}
            data-testid="filter-to-input"
          />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" className="flex-1" data-testid="apply-filters-btn">
            <Search aria-hidden="true" />
            Tìm kiếm
          </Button>
          <Button type="button" variant="outline" onClick={onClear} data-testid="clear-filters-btn">
            <X aria-hidden="true" />
            Xóa bộ lọc
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <label
            htmlFor="filterNeedsAttention"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground select-none"
          >
            <Checkbox
              id="filterNeedsAttention"
              checked={needsAttention}
              onChange={(e) => onNeedsAttentionChange(e.target.checked)}
              data-testid="filter-needs-attention"
            />
            <span>Chỉ hiện đơn cần xử lý (đóng cửa / bảo trì / ngừng kinh doanh)</span>
          </label>

          <label
            htmlFor="filterNeedsRefund"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground select-none"
          >
            <Checkbox
              id="filterNeedsRefund"
              checked={needsRefund}
              onChange={(e) => onNeedsRefundChange(e.target.checked)}
              data-testid="filter-needs-refund"
            />
            <span>Chỉ hiện đơn cần hoàn tiền</span>
          </label>
        </div>
      </form>
    </section>
  );
}
