import { describe, it, expect } from 'vitest';
import {
  isSlotAligned,
  validateBookingTime,
  calculateBookingTotal,
} from '../utils/booking-time.util.js';
import {
  generateBookingCode,
  getBookingDateSegment,
  generateRandomAlphanumeric,
} from '../utils/booking-code.util.js';

describe('Booking Time & Pricing Utilities', () => {
  describe('isSlotAligned', () => {
    it('accepts dates exactly at :00 or :30 with zero seconds and milliseconds', () => {
      expect(isSlotAligned(new Date('2026-09-21T09:00:00.000Z'))).toBe(true);
      expect(isSlotAligned(new Date('2026-09-21T09:30:00.000Z'))).toBe(true);
      expect(isSlotAligned(new Date('2026-09-21T02:00:00.000Z'))).toBe(true);
      expect(isSlotAligned(new Date('2026-09-21T02:30:00.000Z'))).toBe(true);
    });

    it('rejects dates with minutes not aligned to 30', () => {
      expect(isSlotAligned(new Date('2026-09-21T09:15:00.000Z'))).toBe(false);
      expect(isSlotAligned(new Date('2026-09-21T09:45:00.000Z'))).toBe(false);
      expect(isSlotAligned(new Date('2026-09-21T09:01:00.000Z'))).toBe(false);
    });

    it('rejects dates with nonzero seconds or milliseconds', () => {
      expect(isSlotAligned(new Date('2026-09-21T09:00:01.000Z'))).toBe(false);
      expect(isSlotAligned(new Date('2026-09-21T09:00:00.500Z'))).toBe(false);
      expect(isSlotAligned(new Date('2026-09-21T09:30:30.000Z'))).toBe(false);
    });

    it('returns false for invalid dates', () => {
      expect(isSlotAligned(new Date('invalid-date'))).toBe(false);
    });
  });

  describe('validateBookingTime', () => {
    const fixedNow = new Date('2026-09-21T01:00:00.000Z'); // 08:00 VN

    it('accepts valid 1-hour booking starting at least 30 minutes after now', () => {
      const start = new Date('2026-09-21T02:00:00.000Z'); // 09:00 VN (+60m from now)
      const end = new Date('2026-09-21T03:00:00.000Z'); // 10:00 VN (1h duration)
      expect(() => validateBookingTime(start, end, fixedNow)).not.toThrow();
    });

    it('accepts booking starting exactly 30 minutes after now', () => {
      const start = new Date('2026-09-21T01:30:00.000Z'); // exactly +30m from now
      const end = new Date('2026-09-21T02:30:00.000Z'); // 1h duration
      expect(() => validateBookingTime(start, end, fixedNow)).not.toThrow();
    });

    it('accepts valid 4.5-hour booking (allowed under 8-hour maximum)', () => {
      const start = new Date('2026-09-21T02:00:00.000Z');
      const end = new Date('2026-09-21T06:30:00.000Z'); // 4.5 hours
      expect(() => validateBookingTime(start, end, fixedNow)).not.toThrow();
    });

    it('accepts valid 8-hour booking (maximum allowed duration)', () => {
      const start = new Date('2026-09-21T02:00:00.000Z');
      const end = new Date('2026-09-21T10:00:00.000Z'); // 8 hours (480 minutes)
      expect(() => validateBookingTime(start, end, fixedNow)).not.toThrow();
    });

    it('rejects unaligned start or end slot (INVALID_SLOT)', () => {
      const unalignedStart = new Date('2026-09-21T02:15:00.000Z');
      const end = new Date('2026-09-21T03:30:00.000Z');
      expect(() => validateBookingTime(unalignedStart, end, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'INVALID_SLOT',
          statusCode: 400,
          message:
            'Thời gian bắt đầu và kết thúc phải đúng mốc 30 phút (ví dụ: 09:00, 09:30) với giây bằng 0',
        }),
      );

      const start = new Date('2026-09-21T02:00:00.000Z');
      const unalignedEnd = new Date('2026-09-21T03:45:00.000Z');
      expect(() => validateBookingTime(start, unalignedEnd, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'INVALID_SLOT',
          statusCode: 400,
          message:
            'Thời gian bắt đầu và kết thúc phải đúng mốc 30 phút (ví dụ: 09:00, 09:30) với giây bằng 0',
        }),
      );
    });

    it('rejects when end time is equal to or before start time', () => {
      const start = new Date('2026-09-21T02:00:00.000Z');
      const sameEnd = new Date('2026-09-21T02:00:00.000Z');
      expect(() => validateBookingTime(start, sameEnd, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'INVALID_SLOT',
          statusCode: 400,
          message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
        }),
      );

      const beforeEnd = new Date('2026-09-21T01:30:00.000Z');
      expect(() => validateBookingTime(start, beforeEnd, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'INVALID_SLOT',
          statusCode: 400,
          message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
        }),
      );
    });

    it('rejects duration less than 1 hour (MIN_DURATION)', () => {
      const start = new Date('2026-09-21T02:00:00.000Z');
      const end = new Date('2026-09-21T02:30:00.000Z'); // 30 minutes
      expect(() => validateBookingTime(start, end, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'MIN_DURATION',
          statusCode: 400,
          message: 'Thời lượng đặt phòng tối thiểu là 1 giờ (60 phút)',
        }),
      );
    });

    it('rejects duration greater than 8 hours (MAX_DURATION)', () => {
      const start = new Date('2026-09-21T02:00:00.000Z');
      const end = new Date('2026-09-21T10:30:00.000Z'); // 8.5 hours (510 minutes)
      expect(() => validateBookingTime(start, end, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'MAX_DURATION',
          statusCode: 400,
          message: 'Thời lượng đặt phòng tối đa là 8 giờ (480 phút)',
        }),
      );
    });

    it('rejects start time in the past (PAST_TIME)', () => {
      const pastStart = new Date('2026-09-21T00:30:00.000Z'); // before fixedNow
      const end = new Date('2026-09-21T02:00:00.000Z');
      expect(() => validateBookingTime(pastStart, end, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'PAST_TIME',
          statusCode: 400,
          message: 'Thời gian bắt đầu không được ở trong quá khứ',
        }),
      );

      const nowStart = new Date('2026-09-21T01:00:00.000Z'); // exactly now
      expect(() => validateBookingTime(nowStart, end, fixedNow)).toThrowError(
        expect.objectContaining({
          code: 'PAST_TIME',
          statusCode: 400,
          message: 'Thời gian bắt đầu không được ở trong quá khứ',
        }),
      );
    });

    it('rejects booking made less than 30 minutes before start (ADVANCE_NOTICE)', () => {
      const start = new Date('2026-09-21T01:30:00.000Z'); // 30 mins ahead
      const end = new Date('2026-09-21T02:30:00.000Z');
      // If now is 01:00:01 (29 mins 59 secs before start)
      const lateNow = new Date('2026-09-21T01:00:01.000Z');
      expect(() => validateBookingTime(start, end, lateNow)).toThrowError(
        expect.objectContaining({
          code: 'ADVANCE_NOTICE',
          statusCode: 400,
          message: 'Phải đặt phòng trước thời gian bắt đầu ít nhất 30 phút',
        }),
      );
    });
  });

  describe('calculateBookingTotal', () => {
    it('calculates total for 1 hour duration', () => {
      const total = calculateBookingTotal('200000.00', 60);
      expect(total.toString()).toBe('200000');
      expect(total.toFixed(2)).toBe('200000.00');
    });

    it('calculates total for 1.5 hours (90 minutes)', () => {
      const total = calculateBookingTotal('150000.00', 90);
      expect(total.toFixed(2)).toBe('225000.00');
    });

    it('handles fractional cents with deterministic ROUND_HALF_UP', () => {
      // 100.55 * 1.5 hours = 150.825 -> rounds up to 150.83
      const total = calculateBookingTotal('100.55', 90);
      expect(total.toFixed(2)).toBe('150.83');

      // 100.51 * 1.5 hours = 150.765 -> rounds up to 150.77
      const total2 = calculateBookingTotal('100.51', 90);
      expect(total2.toFixed(2)).toBe('150.77');
    });

    it('rounds once on total amount instead of rounding per 30-minute slot', () => {
      // 100.01 * 1.5 hours (90 mins) = 150.015 -> rounds up to 150.02
      // Per-slot rounding would yield: 3 slots * round(50.005) = 3 * 50.01 = 150.03 (incorrect)
      const total = calculateBookingTotal('100.01', 90);
      expect(total.toFixed(2)).toBe('150.02');
    });

    it('handles maximum schema price for 8 hours without precision loss or float drift', () => {
      // 99999999.99 * 8 hours (480 mins) = 799999999.92, fits in Decimal(12,2)
      const total = calculateBookingTotal('99999999.99', 480);
      expect(total.toFixed(2)).toBe('799999999.92');
    });
  });

  describe('Booking Code Generation', () => {
    it('formats date segment as YYYYMMDD in Asia/Ho_Chi_Minh', () => {
      // 2026-09-20T18:00:00.000Z is 2026-09-21T01:00:00+07:00 in Vietnam
      const startUtc = new Date('2026-09-20T18:00:00.000Z');
      const dateSegment = getBookingDateSegment(startUtc);
      expect(dateSegment).toBe('20260921');
    });

    it('generates 4 uppercase alphanumeric characters', () => {
      const random = generateRandomAlphanumeric(4);
      expect(random).toHaveLength(4);
      expect(random).toMatch(/^[0-9A-Z]{4}$/);
    });

    it('generates booking code in CS-YYYYMMDD-XXXX format', () => {
      const start = new Date('2026-09-21T02:00:00.000Z');
      const code = generateBookingCode(start);
      expect(code).toMatch(/^CS-20260921-[0-9A-Z]{4}$/);
    });
  });
});
