import type * as React from 'react';
import { Search, X } from 'lucide-react';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface BookingFiltersProps {
  code: string;
  date: string;
  status: string;
  onCodeChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
}

/** Search bar for the admin bookings list. Draft values and submit logic live in the page. */
export function BookingFilters({
  code,
  date,
  status,
  onCodeChange,
  onDateChange,
  onStatusChange,
  onSubmit,
  onClear,
}: BookingFiltersProps) {
  return (
    <section aria-label="Bộ lọc đặt phòng" className="rounded-xl border bg-card p-5">
      <form
        onSubmit={onSubmit}
        className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <Field id="filterBookingCode" label="Mã đặt phòng">
          <Input
            type="text"
            className="tabular-nums"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="VD: CS-20261003-ABCD"
            data-testid="filter-booking-code-input"
          />
        </Field>

        <Field id="filterDate" label="Ngày bắt đầu (giờ Việt Nam)">
          <Input
            type="date"
            className="tabular-nums"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            data-testid="filter-date-input"
          />
        </Field>

        <Field id="filterStatus" label="Trạng thái đặt phòng">
          <NativeSelect
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            data-testid="filter-status-select"
          >
            <option value="">-- Tất cả trạng thái --</option>
            <option value="CONFIRMED">Đã xác nhận (CONFIRMED)</option>
            <option value="COMPLETED">Đã hoàn tất (COMPLETED)</option>
            <option value="CANCELLED">Đã hủy (CANCELLED)</option>
            <option value="NO_SHOW">Không đến (NO_SHOW)</option>
          </NativeSelect>
        </Field>

        <div className="flex gap-2 sm:col-span-2 xl:col-span-1">
          <Button type="submit" className="flex-1 xl:flex-none" data-testid="apply-filters-btn">
            <Search aria-hidden="true" />
            Tìm kiếm
          </Button>
          <Button type="button" variant="outline" onClick={onClear} data-testid="clear-filters-btn">
            <X aria-hidden="true" />
            Xóa bộ lọc
          </Button>
        </div>
      </form>
    </section>
  );
}
