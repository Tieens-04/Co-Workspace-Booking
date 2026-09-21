import React, { useState, useEffect, useMemo } from 'react';
import { RoomAvailabilitySlot } from '../types/room';
import {
  formatVnTime,
  MIN_LEAD_TIME_MS,
  checkRangeAvailability,
} from '../utils/bookingTime';

export interface TimeGridProps {
  slots: RoomAvailabilitySlot[];
  selectedStartTime?: string | null; // ISO UTC
  selectedEndTime?: string | null;   // ISO UTC
  selectingStartTime?: string | null; // ISO UTC
  onSelectStart: (startIso: string) => void;
  onSelectRange: (startIso: string, endIso: string) => void;
  disabled?: boolean;
  now?: Date;
}

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
    <section className="time-grid-container" aria-label="Lịch trống theo khung giờ">
      <div className="time-grid-legend" role="group" aria-label="Chú thích trạng thái">
        <div className="legend-item">
          <span className="legend-swatch swatch-available" aria-hidden="true" />
          <span>Trống</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch swatch-booked" aria-hidden="true" />
          <span>Đã đặt (không thể chọn)</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch swatch-selected" aria-hidden="true" />
          <span>Đang chọn / Đã chọn</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch swatch-past" aria-hidden="true" />
          <span>Đã qua giờ</span>
        </div>
      </div>

      {slots.length > 0 && !hasValidOneHourRange && (
        <div
          className="time-grid-notice"
          role="status"
          data-testid="time-grid-no-valid-range"
        >
          ℹ️ Ngày này hiện không còn khoảng giờ trống tối thiểu 1 giờ. Vui lòng chọn ngày khác.
        </div>
      )}

      {selectingStartTime && (
        <div className="time-grid-hint" role="status" data-testid="time-grid-selecting-hint">
          📍 Đang chọn từ <strong>{formatVnTime(new Date(selectingStartTime))}</strong>. Vui lòng
          click chọn ô kết thúc (tối thiểu 1 giờ, tối đa 8 giờ).
        </div>
      )}

      {gridError && (
        <div className="alert alert-danger time-grid-error" role="alert" data-testid="time-grid-error">
          {gridError}
        </div>
      )}

      <div className="time-grid" role="group" aria-label="Danh sách 48 khung giờ trong ngày">
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
          let slotClass = 'slot-available';

          if (isBooked) {
            statusText = 'Đã đặt';
            slotClass = 'slot-booked';
          } else if (isPast) {
            statusText = 'Đã qua giờ';
            slotClass = 'slot-past';
          } else if (isSelecting || isInSelectedRange) {
            statusText = isSelecting ? 'Đang chọn bắt đầu' : 'Đã chọn';
            slotClass = 'slot-selected';
          }

          const isBtnDisabled = disabled || isBooked || isPast;
          // AC1 / F2: BOOKED slot must never be aria-pressed
          const isBtnPressed = !isBooked && (isSelecting || isInSelectedRange);

          return (
            <button
              key={slot.startTime}
              type="button"
              className={`time-slot-btn ${slotClass}`}
              disabled={isBtnDisabled}
              aria-pressed={isBtnPressed}
              aria-label={`${slotLabel}: ${statusText}`}
              data-testid={`time-slot-${startTimeStr}`}
              onClick={() => handleSlotClick(slot)}
            >
              <span className="slot-time">{startTimeStr}</span>
              <span className="slot-status">{statusText}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
