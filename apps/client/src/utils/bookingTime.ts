import { RoomAvailabilitySlot } from '../types/room';

export const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const VIETNAM_OFFSET_HOURS = 7;
export const VIETNAM_OFFSET_MS = VIETNAM_OFFSET_HOURS * 60 * 60 * 1000;
export const SLOT_DURATION_MINUTES = 30;
export const SLOT_DURATION_MS = SLOT_DURATION_MINUTES * 60 * 1000;
export const MIN_DURATION_MINUTES = 60;
export const MAX_DURATION_MINUTES = 480;
export const MIN_LEAD_TIME_MS = 30 * 60 * 1000;

export interface BookingTimeErrors {
  startTime?: string;
  endTime?: string;
  note?: string;
  general?: string;
}

export interface BookingValidationResult {
  isValid: boolean;
  errors: BookingTimeErrors;
  durationMinutes?: number;
}

/**
 * Returns a string YYYY-MM-DD for the current date in Vietnam (+07:00).
 */
export function getVietnamTodayString(refDate = new Date()): string {
  const vnDate = new Date(refDate.getTime() + VIETNAM_OFFSET_MS);
  const y = vnDate.getUTCFullYear();
  const m = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vnDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formats a UTC Date to Vietnam wall-clock date string YYYY-MM-DD.
 */
export function formatVnDate(utcDate: Date): string {
  const vnDate = new Date(utcDate.getTime() + VIETNAM_OFFSET_MS);
  const y = vnDate.getUTCFullYear();
  const m = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vnDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formats a UTC Date to Vietnam wall-clock time string HH:mm.
 */
export function formatVnTime(utcDate: Date): string {
  const vnDate = new Date(utcDate.getTime() + VIETNAM_OFFSET_MS);
  const hh = String(vnDate.getUTCHours()).padStart(2, '0');
  const mm = String(vnDate.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Formats a UTC Date to Vietnam wall-clock datetime-local string YYYY-MM-DDTHH:mm.
 */
export function formatVnDateTimeLocal(utcDate: Date): string {
  const vnDate = new Date(utcDate.getTime() + VIETNAM_OFFSET_MS);
  const y = vnDate.getUTCFullYear();
  const m = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vnDate.getUTCDate()).padStart(2, '0');
  const hh = String(vnDate.getUTCHours()).padStart(2, '0');
  const mm = String(vnDate.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/**
 * Parses a Vietnam wall-clock datetime-local string YYYY-MM-DDTHH:mm to a UTC Date object.
 * Returns null if invalid or impossible date (e.g. Feb 31).
 */
export function parseVnDateTimeLocalToUtc(val: string): Date | null {
  if (!val || typeof val !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(val.trim());
  if (!match) return null;
  const [, yStr, mStr, dStr, hStr, minStr] = match;
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);
  const h = parseInt(hStr, 10);
  const min = parseInt(minStr, 10);

  if (m < 1 || m > 12 || d < 1 || d > 31 || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }

  // Explicit ISO with +07:00 offset ensures timezone independence across browsers/environments
  const isoString = `${yStr}-${mStr}-${dStr}T${hStr}:${minStr}:00.000+07:00`;
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return null;

  // Verify that date did not roll over (e.g. Feb 31 -> Mar 3)
  const vnCheck = new Date(parsed.getTime() + VIETNAM_OFFSET_MS);
  if (
    vnCheck.getUTCFullYear() !== y ||
    vnCheck.getUTCMonth() + 1 !== m ||
    vnCheck.getUTCDate() !== d ||
    vnCheck.getUTCHours() !== h ||
    vnCheck.getUTCMinutes() !== min
  ) {
    return null;
  }

  return parsed;
}

/**
 * Returns Vietnam calendar dates covered by the interval [startUtc, endUtc).
 * For a range up to 8 hours, this is either 1 date or 2 dates.
 * If endUtc touches midnight (00:00:00 of next day), it does NOT include the next day
 * because [start, end) is half-open (end-exclusive).
 */
export function getCoveredVnDates(startUtc: Date, endUtc: Date): string[] {
  if (endUtc.getTime() <= startUtc.getTime()) {
    return [formatVnDate(startUtc)];
  }
  const startDateStr = formatVnDate(startUtc);
  const endMinusOne = new Date(endUtc.getTime() - 1);
  const endDateStr = formatVnDate(endMinusOne);
  if (startDateStr === endDateStr) {
    return [startDateStr];
  }
  return [startDateStr, endDateStr];
}

/**
 * Parses pricePerHour string (e.g. "250000.00" or "250000") to integer cents.
 */
export function parsePriceToCents(priceStr: string): number | null {
  if (!priceStr || typeof priceStr !== 'string') return null;
  const trimmed = priceStr.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [intPart, fracPart = ''] = trimmed.split('.');
  const cents = parseInt(intPart, 10) * 100 + parseInt(fracPart.padEnd(2, '0'), 10);
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  return cents;
}

/**
 * Computes subtotal decimal-safe using integer cents and ROUND_HALF_UP once on total.
 * Returns formatted decimal string e.g. "375000.00" or "150.02".
 */
export function calculateEstimatedTotal(
  pricePerHour: string,
  durationMinutes: number,
): string | null {
  if (
    durationMinutes < MIN_DURATION_MINUTES ||
    durationMinutes > MAX_DURATION_MINUTES ||
    durationMinutes % 30 !== 0
  ) {
    return null;
  }
  const priceCents = parsePriceToCents(pricePerHour);
  if (priceCents === null) return null;
  const slotCount = durationMinutes / 30;
  const subtotalCents = Math.floor((priceCents * slotCount + 1) / 2);
  const dollars = Math.floor(subtotalCents / 100);
  const cents = subtotalCents % 100;
  return `${dollars}.${String(cents).padStart(2, '0')}`;
}

/**
 * Validates booking selection against all business time rules.
 */
export function validateBookingSelection(
  startUtc: Date | null,
  endUtc: Date | null,
  now: Date = new Date(),
  note?: string,
): BookingValidationResult {
  const errors: BookingTimeErrors = {};

  if (!startUtc) {
    errors.startTime = 'Vui lòng chọn thời gian bắt đầu';
  }
  if (!endUtc) {
    errors.endTime = 'Vui lòng chọn thời gian kết thúc';
  }

  if (startUtc && endUtc) {
    if (startUtc.getUTCMinutes() % 30 !== 0 || startUtc.getUTCSeconds() !== 0 || startUtc.getUTCMilliseconds() !== 0) {
      errors.startTime = 'Thời gian bắt đầu phải theo mốc 30 phút (ví dụ: 09:00, 09:30)';
    }
    if (endUtc.getUTCMinutes() % 30 !== 0 || endUtc.getUTCSeconds() !== 0 || endUtc.getUTCMilliseconds() !== 0) {
      errors.endTime = 'Thời gian kết thúc phải theo mốc 30 phút (ví dụ: 10:00, 10:30)';
    }

    if (!errors.startTime && !errors.endTime) {
      if (endUtc <= startUtc) {
        errors.endTime = 'Thời gian kết thúc phải sau thời gian bắt đầu';
      } else {
        const durationMins = (endUtc.getTime() - startUtc.getTime()) / (60 * 1000);
        if (durationMins < MIN_DURATION_MINUTES) {
          errors.endTime = 'Thời lượng đặt phòng tối thiểu là 1 giờ';
        } else if (durationMins > MAX_DURATION_MINUTES) {
          errors.endTime = 'Thời lượng đặt phòng tối đa là 8 giờ';
        }
      }

      if (startUtc <= now) {
        errors.startTime = 'Thời gian bắt đầu không được ở trong quá khứ';
      } else if (startUtc.getTime() - now.getTime() < MIN_LEAD_TIME_MS) {
        errors.startTime = 'Phải đặt phòng trước thời gian bắt đầu ít nhất 30 phút';
      }
    }
  }

  if (note && note.trim().length > 500) {
    errors.note = 'Ghi chú không được vượt quá 500 ký tự';
  }

  const isValid = Object.keys(errors).length === 0;
  const durationMinutes =
    startUtc && endUtc && endUtc > startUtc
      ? (endUtc.getTime() - startUtc.getTime()) / (60 * 1000)
      : undefined;

  return {
    isValid,
    errors,
    durationMinutes,
  };
}

/**
 * Checks if interval [startUtc, endUtc) is fully covered by contiguous AVAILABLE slots.
 */
export function checkRangeAvailability(
  startUtc: Date,
  endUtc: Date,
  slots: RoomAvailabilitySlot[],
): {
  isAvailable: boolean;
  reason?: 'BOOKED_SLOT' | 'MISSING_SLOT';
  conflictingSlot?: RoomAvailabilitySlot;
} {
  if (endUtc.getTime() <= startUtc.getTime()) {
    return { isAvailable: false };
  }

  const slotMap = new Map<number, RoomAvailabilitySlot>();
  for (const slot of slots) {
    const time = new Date(slot.startTime).getTime();
    slotMap.set(time, slot);
  }

  const startMs = startUtc.getTime();
  const endMs = endUtc.getTime();

  for (let currentMs = startMs; currentMs < endMs; currentMs += SLOT_DURATION_MS) {
    const slot = slotMap.get(currentMs);
    if (!slot) {
      return { isAvailable: false, reason: 'MISSING_SLOT' };
    }
    if (slot.status === 'BOOKED') {
      return { isAvailable: false, reason: 'BOOKED_SLOT', conflictingSlot: slot };
    }
  }

  return { isAvailable: true };
}
