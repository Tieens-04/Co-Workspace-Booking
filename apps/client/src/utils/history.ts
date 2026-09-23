import { BookingResult } from '../types/booking';

/**
 * Validates whether an incoming object conforms to a valid BookingResult structure.
 * Defensively ensures nested fields like room, note, and dates are valid types
 * to prevent runtime crashes or TypeErrors during rendering.
 */
export function isValidBookingResult(b: unknown): b is BookingResult {
  if (typeof b !== 'object' || b === null) return false;
  const record = b as Record<string, unknown>;

  if (typeof record.bookingCode !== 'string' || record.bookingCode.trim() === '') {
    return false;
  }

  if (typeof record.room !== 'object' || record.room === null) {
    return false;
  }
  const room = record.room as Record<string, unknown>;
  if (typeof room.name !== 'string' || room.name.trim() === '') {
    return false;
  }
  if ('id' in room && room.id !== undefined && typeof room.id !== 'string') {
    return false;
  }

  if (typeof record.startTime !== 'string' || isNaN(Date.parse(record.startTime))) {
    return false;
  }
  if (typeof record.endTime !== 'string' || isNaN(Date.parse(record.endTime))) {
    return false;
  }

  // totalAmount: must be a valid finite non-negative decimal number string per BookingResult
  if (
    typeof record.totalAmount !== 'string' ||
    record.totalAmount.trim() === '' ||
    !/^\d+(\.\d+)?$/.test(record.totalAmount.trim()) ||
    !Number.isFinite(Number(record.totalAmount)) ||
    Number(record.totalAmount) < 0
  ) {
    return false;
  }

  // note: must be string, null, or undefined if present
  if (
    'note' in record &&
    record.note !== undefined &&
    record.note !== null &&
    typeof record.note !== 'string'
  ) {
    return false;
  }

  // status: required non-empty string per BookingResult
  if (typeof record.status !== 'string' || record.status.trim() === '') {
    return false;
  }

  // paymentStatus: required non-empty string per BookingResult
  if (typeof record.paymentStatus !== 'string' || record.paymentStatus.trim() === '') {
    return false;
  }

  return true;
}

/**
 * Safely sanitizes the current browser history state by clearing the `usr` payload
 * while strictly preserving React Router's internal navigation metadata (`idx` and `key`).
 *
 * This prevents sensitive router state (such as booking codes, notes, totals) from
 * persisting in window.history.state across logout, account switching, or history navigation,
 * while preventing NaN index corruption in React Router.
 */
export function sanitizeHistoryState(): void {
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    const current = window.history.state;
    if (typeof current === 'object' && current !== null) {
      const nextState = { ...current };
      let changed = false;

      if ('usr' in nextState && nextState.usr !== null) {
        nextState.usr = null;
        changed = true;
      }
      if ('booking' in nextState) {
        delete nextState.booking;
        changed = true;
      }
      if ('bookingCode' in nextState) {
        delete nextState.bookingCode;
        changed = true;
      }
      if ('customerId' in nextState) {
        delete nextState.customerId;
        changed = true;
      }

      if (changed) {
        window.history.replaceState(nextState, '');
      }
    }
  }
}
