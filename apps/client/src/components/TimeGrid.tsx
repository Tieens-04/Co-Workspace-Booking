import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoomAvailabilitySlot } from '../types/room';
import { formatVnTime, MIN_LEAD_TIME_MS, checkRangeAvailability } from '../utils/bookingTime';
import { Notice } from './booking/Notice';

export interface TimeGridProps {
  slots: RoomAvailabilitySlot[];
  selectedStartTime?: string | null; // ISO UTC
  selectedEndTime?: string | null; // ISO UTC
  selectingStartTime?: string | null; // ISO UTC
  onSelectStart: (startIso: string) => void;
  onSelectRange: (startIso: string, endIso: string) => void;
  disabled?: boolean;
  now?: Date;
}

type SlotState = 'available' | 'booked' | 'past' | 'selected';

const SLOT_STATE_CLASSES: Record<SlotState, string> = {
  available:
    'border-input bg-card text-foreground hover:border-primary hover:bg-primary/5 disabled:opacity-50',
  selected: 'border-primary bg-primary text-primary-foreground',
  booked: 'border-border bg-muted bg-hatch text-booked-foreground line-through',
  past: 'border-border bg-transparent text-muted-foreground opacity-40',
};

const SWATCH_CLASSES: Record<SlotState, string> = {
  available: 'border-input bg-card',
  selected: 'border-primary bg-primary',
  booked: 'border-border bg-muted bg-hatch',
  past: 'border-border bg-transparent opacity-40',
};

const LEGEND_ITEMS: { state: SlotState; label: string }[] = [
  { state: 'available', label: 'Trống' },
  { state: 'booked', label: 'Đã đặt (không thể chọn)' },
  { state: 'selected', label: 'Đang chọn / Đã chọn' },
  { state: 'past', label: 'Đã qua giờ' },
];

export const TimeGrid: React.FC<TimeGridProps> = ({
  slots,
  selectedStartTime,
  selectedEndTime,
  selectingStartTime,
  onSelectStart,
  onSelectRange,
  disabled = false,
  now,
}) => {
  const [gridError, setGridError] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState<Date>(() => now || new Date());
  const gridRef = useRef<HTMLDivElement>(null);
  const dayKey = slots[0]?.startTime ?? '';

  // When a day's slots load, scroll the grid (not the page) to the first slot that is not past,
  // so "today" opens at the bookable hours. Runs once per day, never against the user's scroll.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !dayKey) return;
    const firstOpen = grid.querySelector<HTMLElement>(
      '[data-slot-state]:not([data-slot-state="past"])',
    );
    if (!firstOpen) return;
    const offset =
      firstOpen.getBoundingClientRect().top - grid.getBoundingClientRect().top + grid.scrollTop;
    grid.scrollTop = Math.max(0, offset - 8);
  }, [dayKey]);

  // Update clockNow when now prop changes or when next slot expires lead time
  useEffect(() => {
    if (now) {
      setClockNow(now);
      return;
    }

    const currentMs = Date.now();
    let nextExpiryMs: number | null = null;
    for (const slot of slots) {
      const slotStartMs = new Date(slot.startTime).getTime();
      // N3: A slot is currently not past if slotStartMs - currentMs >= MIN_LEAD_TIME_MS
      if (slotStartMs - currentMs >= MIN_LEAD_TIME_MS) {
        // It expires lead time at slotStartMs - MIN_LEAD_TIME_MS + 50ms buffer
        const expiryMs = slotStartMs - MIN_LEAD_TIME_MS + 50;
        if (nextExpiryMs === null || expiryMs < nextExpiryMs) {
          nextExpiryMs = expiryMs;
        }
      }
    }

    if (nextExpiryMs === null) return;
    const rawDelay = Math.max(50, nextExpiryMs - currentMs);
    // N1: Cap delay at 1 hour (3,600,000 ms) to prevent 32-bit integer overflow warning (2,147,483,647 ms)
    // and eliminate infinite 1ms render loops when viewing dates far in the future
    const MAX_TIMER_DELAY_MS = 60 * 60 * 1000;
    const delay = Math.min(rawDelay, MAX_TIMER_DELAY_MS);

    const timerId = setTimeout(() => {
      setClockNow(new Date());
    }, delay);

    return () => clearTimeout(timerId);
  }, [slots, clockNow, now]);

  const currentTime = now || clockNow;
  const currentMs = currentTime.getTime();

  // Convert selected start/end to timestamps for fast range checks
  const selStartMs = selectedStartTime ? new Date(selectedStartTime).getTime() : null;
  const selEndMs = selectedEndTime ? new Date(selectedEndTime).getTime() : null;
  const selectingStartMs = selectingStartTime ? new Date(selectingStartTime).getTime() : null;

  // Check if the loaded slots contain at least one contiguous available 1-hour range
  const hasValidOneHourRange = useMemo(() => {
    if (slots.length < 2) return false;
    for (let i = 0; i < slots.length - 1; i++) {
      const s1 = slots[i];
      const s2 = slots[i + 1];
      const s1StartMs = new Date(s1.startTime).getTime();
      const isS1Valid = s1.status === 'AVAILABLE' && s1StartMs - currentMs >= MIN_LEAD_TIME_MS;
      const isS2Valid = s2.status === 'AVAILABLE';
      if (isS1Valid && isS2Valid) {
        return true;
      }
    }
    return false;
  }, [slots, currentMs]);

  // Display-only counts for the summary line; selection rules stay in handleSlotClick.
  const slotCounts = useMemo(() => {
    let open = 0;
    let booked = 0;
    for (const slot of slots) {
      if (slot.status === 'BOOKED') booked += 1;
      else if (new Date(slot.startTime).getTime() - currentMs >= MIN_LEAD_TIME_MS) open += 1;
    }
    return { open, booked };
  }, [slots, currentMs]);

  const handleSlotClick = (slot: RoomAvailabilitySlot) => {
    if (disabled) return;
    setGridError(null);

    const clickNow = now || new Date();
    const clickMs = clickNow.getTime();

    const slotStartMs = new Date(slot.startTime).getTime();
    const slotEndMs = new Date(slot.endTime).getTime();

    // Check if clicked slot is past or under lead time at moment of click
    if (slotStartMs - clickMs < MIN_LEAD_TIME_MS) {
      setGridError('Khung giờ này đã quá thời gian đặt trước ít nhất 30 phút.');
      return;
    }

    // If not currently selecting an end slot (or starting fresh)
    if (!selectingStartTime || !selectingStartMs) {
      onSelectStart(slot.startTime);
      return;
    }

    // If selecting an end slot, also verify selectingStartTime hasn't expired
    if (selectingStartMs - clickMs < MIN_LEAD_TIME_MS) {
      setGridError(
        'Khung giờ bắt đầu đã quá thời gian đặt trước ít nhất 30 phút. Vui lòng chọn lại.',
      );
      onSelectStart('');
      return;
    }

    // If clicked slot is before the current selectingStart, reset start to this slot
    if (slotStartMs < selectingStartMs) {
      onSelectStart(slot.startTime);
      return;
    }

    // If clicked the same slot as selectingStart (duration only 30 mins)
    if (slotStartMs === selectingStartMs) {
      setGridError(
        'Thời lượng đặt phòng tối thiểu là 1 giờ. Vui lòng chọn ô kết thúc sau ô bắt đầu ít nhất 1 giờ.',
      );
      return;
    }

    // Clicked slot is after start -> candidate range is [selectingStart, slot.endTime)
    const durationMinutes = (slotEndMs - selectingStartMs) / (60 * 1000);

    if (durationMinutes < 60) {
      setGridError(
        'Thời lượng đặt phòng tối thiểu là 1 giờ. Vui lòng chọn ô kết thúc sau ô bắt đầu ít nhất 1 giờ.',
      );
      return;
    }

    if (durationMinutes > 480) {
      setGridError('Thời lượng đặt phòng tối đa là 8 giờ.');
      return;
    }

    // Check if range goes through any BOOKED slots
    const rangeCheck = checkRangeAvailability(
      new Date(selectingStartMs),
      new Date(slotEndMs),
      slots,
    );

    if (!rangeCheck.isAvailable) {
      setGridError(
        'Khoảng thời gian đã chọn đi qua khung giờ đã có người đặt. Vui lòng chọn khoảng giờ liên tục không có slot bận.',
      );
      return;
    }

    // Valid range selected!
    onSelectRange(selectingStartTime, slot.endTime);
  };

  return (
    <section className="grid gap-3" aria-label="Lịch trống theo khung giờ">
      {slots.length > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="time-grid-summary">
          <strong className="font-semibold text-foreground tabular-nums">{slotCounts.open}</strong>{' '}
          khung 30 phút còn đặt được
          {slotCounts.booked > 0 && (
            <>
              {' · '}
              <span className="tabular-nums">{slotCounts.booked}</span> khung đã có người đặt
            </>
          )}
        </p>
      )}

      <div
        className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
        role="group"
        aria-label="Chú thích trạng thái"
      >
        {LEGEND_ITEMS.map((item) => (
          <div key={item.state} className="inline-flex items-center gap-2">
            <span
              className={cn(
                'inline-block h-3.5 w-[1.125rem] rounded-sm border',
                SWATCH_CLASSES[item.state],
              )}
              aria-hidden="true"
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {slots.length > 0 && !hasValidOneHourRange && (
        <Notice tone="warning" role="status" data-testid="time-grid-no-valid-range">
          Ngày này hiện không còn khoảng giờ trống tối thiểu 1 giờ. Vui lòng chọn ngày khác.
        </Notice>
      )}

      {selectingStartTime && (
        <Notice
          tone="info"
          icon={MapPin}
          role="status"
          data-testid="time-grid-selecting-hint"
          className="animate-rise"
        >
          Đang chọn từ{' '}
          <strong className="font-semibold tabular-nums">
            {formatVnTime(new Date(selectingStartTime))}
          </strong>
          . Vui lòng click chọn ô kết thúc (tối thiểu 1 giờ, tối đa 8 giờ).
        </Notice>
      )}

      {gridError && (
        <Notice tone="error" role="alert" data-testid="time-grid-error">
          {gridError}
        </Notice>
      )}

      <div
        ref={gridRef}
        className="grid max-h-[22rem] grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1.5 overflow-y-auto rounded-lg border bg-background p-2 [scrollbar-width:thin]"
        role="group"
        aria-label="Danh sách 48 khung giờ trong ngày"
      >
        {slots.map((slot) => {
          const slotStartMs = new Date(slot.startTime).getTime();
          const slotEndMs = new Date(slot.endTime).getTime();

          const isBooked = slot.status === 'BOOKED';
          // Past or under 30m lead time
          const isPast = slotStartMs - currentMs < MIN_LEAD_TIME_MS;

          // Selecting start slot
          const isSelecting = selectingStartMs === slotStartMs;

          // Range selection check [selStartMs, selEndMs)
          const isInSelectedRange =
            selStartMs !== null &&
            selEndMs !== null &&
            slotStartMs >= selStartMs &&
            slotEndMs <= selEndMs;

          const startTimeStr = formatVnTime(new Date(slot.startTime));
          const endTimeStr = formatVnTime(new Date(slot.endTime));
          const slotLabel = `${startTimeStr} - ${endTimeStr}`;

          let statusText = 'Trống';
          let slotState: SlotState = 'available';

          if (isBooked) {
            statusText = 'Đã đặt';
            slotState = 'booked';
          } else if (isPast) {
            statusText = 'Đã qua giờ';
            slotState = 'past';
          } else if (isSelecting || isInSelectedRange) {
            statusText = isSelecting ? 'Đang chọn bắt đầu' : 'Đã chọn';
            slotState = 'selected';
          }

          const isBtnDisabled = disabled || isBooked || isPast;
          // AC1 / F2: BOOKED slot must never be aria-pressed
          const isBtnPressed = !isBooked && (isSelecting || isInSelectedRange);

          return (
            <button
              key={slot.startTime}
              type="button"
              className={cn(
                'flex h-9 items-center justify-center rounded-md border text-[0.8125rem] font-medium tabular-nums transition-[background-color,border-color,color,transform] duration-200 ease-editorial outline-none select-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.96] disabled:cursor-not-allowed disabled:active:scale-100',
                SLOT_STATE_CLASSES[slotState],
              )}
              disabled={isBtnDisabled}
              aria-pressed={isBtnPressed}
              aria-label={`${slotLabel}: ${statusText}`}
              data-slot-state={slotState}
              data-testid={`time-slot-${startTimeStr}`}
              onClick={() => handleSlotClick(slot)}
            >
              {startTimeStr}
            </button>
          );
        })}
      </div>
    </section>
  );
};
