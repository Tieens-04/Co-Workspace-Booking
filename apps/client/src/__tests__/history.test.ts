import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { sanitizeHistoryState, isValidBookingResult } from '../utils/history';

describe('sanitizeHistoryState', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes usr property to null while strictly preserving idx and key metadata', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const initialRouterState = {
      idx: 2,
      key: 'test-key-123',
      usr: {
        booking: { bookingCode: 'CS-20261025-ABCD' },
        customerId: 'customer-1',
      },
    };

    window.history.replaceState(initialRouterState, '');
    replaceSpy.mockClear();

    sanitizeHistoryState();

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({
      idx: 2,
      key: 'test-key-123',
      usr: null,
    });
    expect(window.history.state.idx).toBe(2);
    expect(window.history.state.key).toBe('test-key-123');
    expect(window.history.state.usr).toBeNull();
  });

  it('cleans legacy root-level booking keys if present on state', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const stateWithRootKeys = {
      idx: 1,
      key: 'abc',
      booking: { id: 'b1' },
      bookingCode: 'CS-123',
      customerId: 'c1',
    };

    window.history.replaceState(stateWithRootKeys, '');
    replaceSpy.mockClear();

    sanitizeHistoryState();

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({
      idx: 1,
      key: 'abc',
    });
    expect(window.history.state.booking).toBeUndefined();
    expect(window.history.state.bookingCode).toBeUndefined();
    expect(window.history.state.customerId).toBeUndefined();
  });

  it('does not mutate or call replaceState if state has no usr or booking data', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const cleanState = {
      idx: 3,
      key: 'def',
      usr: null,
    };

    window.history.replaceState(cleanState, '');
    replaceSpy.mockClear();

    sanitizeHistoryState();

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.history.state).toEqual(cleanState);
  });

  it('handles null history state safely without throwing', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    // Simulate null state
    Object.defineProperty(window.history, 'state', {
      value: null,
      configurable: true,
      writable: true,
    });

    expect(() => sanitizeHistoryState()).not.toThrow();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});

describe('isValidBookingResult', () => {
  const validBooking = {
    id: 'b-1',
    bookingCode: 'CS-20261025-ABCD',
    room: { id: 'r-1', name: 'Phòng Hội Thảo' },
    startTime: '2026-10-25T03:00:00.000Z',
    endTime: '2026-10-25T05:00:00.000Z',
    totalAmount: '400000.00',
    note: 'Ghi chú',
    status: 'CONFIRMED',
    paymentStatus: 'UNPAID',
    paymentMethod: null,
  };

  it('accepts valid BookingResult objects', () => {
    expect(isValidBookingResult(validBooking)).toBe(true);
    expect(isValidBookingResult({ ...validBooking, note: null })).toBe(true);
    expect(isValidBookingResult({ ...validBooking, totalAmount: '0.00' })).toBe(true);
    expect(isValidBookingResult({ ...validBooking, totalAmount: '50000' })).toBe(true);
  });

  it('rejects primitive or non-object values', () => {
    expect(isValidBookingResult(null)).toBe(false);
    expect(isValidBookingResult(undefined)).toBe(false);
    expect(isValidBookingResult('string')).toBe(false);
    expect(isValidBookingResult(12345)).toBe(false);
    expect(isValidBookingResult(true)).toBe(false);
  });

  it('rejects malformed totalAmount (non-numeric, negative, whitespace, or infinite/overflow)', () => {
    expect(isValidBookingResult({ ...validBooking, totalAmount: 'abc' })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, totalAmount: '-100' })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, totalAmount: '' })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, totalAmount: '   ' })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, totalAmount: 400000 as unknown as string })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, totalAmount: '9'.repeat(400) })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, totalAmount: 'Infinity' })).toBe(false);
  });

  it('rejects missing or empty status', () => {
    expect(isValidBookingResult({ ...validBooking, status: '' })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, status: '   ' })).toBe(false);
    const noStatus = { ...validBooking };
    delete (noStatus as { status?: string }).status;
    expect(isValidBookingResult(noStatus)).toBe(false);
  });

  it('rejects missing or empty paymentStatus', () => {
    expect(isValidBookingResult({ ...validBooking, paymentStatus: '' })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, paymentStatus: '   ' })).toBe(false);
    const noPaymentStatus = { ...validBooking };
    delete (noPaymentStatus as { paymentStatus?: string }).paymentStatus;
    expect(isValidBookingResult(noPaymentStatus)).toBe(false);
  });

  it('rejects malformed note (objects or numbers)', () => {
    expect(isValidBookingResult({ ...validBooking, note: {} as unknown as string })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, note: 12345 as unknown as string })).toBe(false);
  });

  it('rejects malformed room (null, missing name, or empty name)', () => {
    expect(isValidBookingResult({ ...validBooking, room: null as unknown as any })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, room: { id: 'r-1', name: '' } })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, room: { id: 'r-1', name: '  ' } })).toBe(false);
  });

  it('rejects invalid date strings for startTime or endTime', () => {
    expect(isValidBookingResult({ ...validBooking, startTime: 'not-a-date' })).toBe(false);
    expect(isValidBookingResult({ ...validBooking, endTime: 'not-a-date' })).toBe(false);
  });
});

