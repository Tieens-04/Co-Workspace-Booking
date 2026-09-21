import { describe, it, expect } from 'vitest';
import {
  getVietnamTodayString,
  formatVnDate,
  formatVnTime,
  formatVnDateTimeLocal,
  parseVnDateTimeLocalToUtc,
  getCoveredVnDates,
  parsePriceToCents,
  calculateEstimatedTotal,
  validateBookingSelection,
  checkRangeAvailability,
} from '../utils/bookingTime';
import { RoomAvailabilitySlot } from '../types/room';

describe('bookingTime utility', () => {
  describe('Timezone and Formatting', () => {
    it('returns correct Vietnam today string YYYY-MM-DD', () => {
      // 2026-10-24T20:00:00.000Z is 2026-10-25T03:00:00 in Vietnam (+07:00)
      const refDate = new Date('2026-10-24T20:00:00.000Z');
      expect(getVietnamTodayString(refDate)).toBe('2026-10-25');
    });

    it('formats UTC Date to Vietnam date, time and datetime-local strings', () => {
      // 2026-10-25T03:30:00.000Z is 2026-10-25 10:30 in Vietnam
      const date = new Date('2026-10-25T03:30:00.000Z');
      expect(formatVnDate(date)).toBe('2026-10-25');
      expect(formatVnTime(date)).toBe('10:30');
      expect(formatVnDateTimeLocal(date)).toBe('2026-10-25T10:30');
    });

    it('parses Vietnam datetime-local string to UTC Date correctly', () => {
      const parsed = parseVnDateTimeLocalToUtc('2026-10-25T10:30');
      expect(parsed).not.toBeNull();
      expect(parsed!.toISOString()).toBe('2026-10-25T03:30:00.000Z');
    });

    it('rejects invalid or impossible dates', () => {
      expect(parseVnDateTimeLocalToUtc('')).toBeNull();
      expect(parseVnDateTimeLocalToUtc('invalid')).toBeNull();
      // Feb 31 does not exist
      expect(parseVnDateTimeLocalToUtc('2026-02-31T10:00')).toBeNull();
      // Apr 31 does not exist
      expect(parseVnDateTimeLocalToUtc('2026-04-31T10:00')).toBeNull();
      // Invalid hour / minute
      expect(parseVnDateTimeLocalToUtc('2026-10-25T24:00')).toBeNull();
      expect(parseVnDateTimeLocalToUtc('2026-10-25T10:60')).toBeNull();
    });
  });

  describe('Covered Dates for Selection', () => {
    it('returns single date for range within the same day', () => {
      const start = new Date('2026-10-25T02:00:00.000Z'); // 09:00 VN
      const end = new Date('2026-10-25T04:00:00.000Z'); // 11:00 VN
      expect(getCoveredVnDates(start, end)).toEqual(['2026-10-25']);
    });

    it('returns single date when range ends exactly at midnight (00:00 next day)', () => {
      // 23:00 VN on 2026-10-25 to 00:00 VN on 2026-10-26 (16:00 to 17:00 UTC on 2026-10-25)
      const start = new Date('2026-10-25T16:00:00.000Z'); // 23:00 VN
      const end = new Date('2026-10-25T17:00:00.000Z'); // 00:00 VN next day
      expect(getCoveredVnDates(start, end)).toEqual(['2026-10-25']);
    });

    it('returns two dates when range spans overnight past midnight', () => {
      // 23:00 VN on 2026-10-25 to 01:00 VN on 2026-10-26
      const start = new Date('2026-10-25T16:00:00.000Z'); // 23:00 VN
      const end = new Date('2026-10-25T18:00:00.000Z'); // 01:00 VN
      expect(getCoveredVnDates(start, end)).toEqual(['2026-10-25', '2026-10-26']);
    });
  });

  describe('Price & Decimal Subtotal Calculation', () => {
    it('parses valid price string to integer cents', () => {
      expect(parsePriceToCents('250000.00')).toBe(25000000);
      expect(parsePriceToCents('250000')).toBe(25000000);
      expect(parsePriceToCents('100.01')).toBe(10001);
      expect(parsePriceToCents('0.00')).toBe(0);
      expect(parsePriceToCents('invalid')).toBeNull();
      expect(parsePriceToCents('-100')).toBeNull();
    });

    it('calculates subtotal with ROUND_HALF_UP matching backend', () => {
      // 250,000 * 1.5h = 375,000
      expect(calculateEstimatedTotal('250000.00', 90)).toBe('375000.00');
      // 100.01 * 1.5h = 150.015 -> 150.02
      expect(calculateEstimatedTotal('100.01', 90)).toBe('150.02');
      // 200,000 * 2h = 400,000
      expect(calculateEstimatedTotal('200000.00', 120)).toBe('400000.00');
      // 200,000 * 8h = 1,600,000
      expect(calculateEstimatedTotal('200000.00', 480)).toBe('1600000.00');
      // 0 * 2h = 0.00
      expect(calculateEstimatedTotal('0.00', 120)).toBe('0.00');
      // Invalid duration or price returns null
      expect(calculateEstimatedTotal('200000.00', 0)).toBeNull();
      expect(calculateEstimatedTotal('200000.00', 45)).toBeNull(); // not multiple of 30
      expect(calculateEstimatedTotal('invalid', 60)).toBeNull();
    });
  });

  describe('Validation of Booking Selection', () => {
    const fixedNow = new Date('2026-10-25T00:00:00.000Z');

    it('validates required start and end times', () => {
      const res = validateBookingSelection(null, null, fixedNow);
      expect(res.isValid).toBe(false);
      expect(res.errors.startTime).toBe('Vui lòng chọn thời gian bắt đầu');
      expect(res.errors.endTime).toBe('Vui lòng chọn thời gian kết thúc');
    });

    it('validates 30-minute slot alignment', () => {
      const start = new Date('2026-10-25T03:15:00.000Z');
      const end = new Date('2026-10-25T05:00:00.000Z');
      const res = validateBookingSelection(start, end, fixedNow);
      expect(res.isValid).toBe(false);
      expect(res.errors.startTime).toContain('mốc 30 phút');
    });

    it('validates minimum duration 1 hour', () => {
      const start = new Date('2026-10-25T03:00:00.000Z');
      const end = new Date('2026-10-25T03:30:00.000Z'); // 30 mins
      const res = validateBookingSelection(start, end, fixedNow);
      expect(res.isValid).toBe(false);
      expect(res.errors.endTime).toBe('Thời lượng đặt phòng tối thiểu là 1 giờ');
    });

    it('validates maximum duration 8 hours', () => {
      const start = new Date('2026-10-25T03:00:00.000Z');
      const end = new Date('2026-10-25T11:30:00.000Z'); // 8.5 hours
      const res = validateBookingSelection(start, end, fixedNow);
      expect(res.isValid).toBe(false);
      expect(res.errors.endTime).toBe('Thời lượng đặt phòng tối đa là 8 giờ');
    });

    it('validates lead time of at least 30 minutes', () => {
      // fixedNow is 00:10, start is 00:30 (slot aligned, but only 20 min lead time < 30 min)
      const now = new Date('2026-10-25T00:10:00.000Z');
      const start = new Date('2026-10-25T00:30:00.000Z');
      const end = new Date('2026-10-25T02:00:00.000Z');
      const res = validateBookingSelection(start, end, now);
      expect(res.isValid).toBe(false);
      expect(res.errors.startTime).toContain('trước thời gian bắt đầu ít nhất 30 phút');
    });

    it('validates start is not in the past', () => {
      const start = new Date('2026-10-24T23:00:00.000Z');
      const end = new Date('2026-10-25T02:00:00.000Z');
      const res = validateBookingSelection(start, end, fixedNow);
      expect(res.isValid).toBe(false);
      expect(res.errors.startTime).toBe('Thời gian bắt đầu không được ở trong quá khứ');
    });

    it('validates note length <= 500 characters', () => {
      const start = new Date('2026-10-25T03:00:00.000Z');
      const end = new Date('2026-10-25T05:00:00.000Z');
      const res = validateBookingSelection(start, end, fixedNow, 'a'.repeat(501));
      expect(res.isValid).toBe(false);
      expect(res.errors.note).toBe('Ghi chú không được vượt quá 500 ký tự');
    });

    it('passes for valid 1-hour booking', () => {
      const start = new Date('2026-10-25T03:00:00.000Z');
      const end = new Date('2026-10-25T04:00:00.000Z');
      const res = validateBookingSelection(start, end, fixedNow, 'Valid note');
      expect(res.isValid).toBe(true);
      expect(res.durationMinutes).toBe(60);
      expect(Object.keys(res.errors).length).toBe(0);
    });

    it('passes for valid 8-hour booking', () => {
      const start = new Date('2026-10-25T03:00:00.000Z');
      const end = new Date('2026-10-25T11:00:00.000Z');
      const res = validateBookingSelection(start, end, fixedNow);
      expect(res.isValid).toBe(true);
      expect(res.durationMinutes).toBe(480);
    });
  });

  describe('Range Availability Check', () => {
    const slots: RoomAvailabilitySlot[] = [
      {
        startTime: '2026-10-25T03:00:00.000Z',
        endTime: '2026-10-25T03:30:00.000Z',
        status: 'AVAILABLE',
      },
      {
        startTime: '2026-10-25T03:30:00.000Z',
        endTime: '2026-10-25T04:00:00.000Z',
        status: 'AVAILABLE',
      },
      {
        startTime: '2026-10-25T04:00:00.000Z',
        endTime: '2026-10-25T04:30:00.000Z',
        status: 'BOOKED',
      },
      {
        startTime: '2026-10-25T04:30:00.000Z',
        endTime: '2026-10-25T05:00:00.000Z',
        status: 'AVAILABLE',
      },
    ];

    it('returns isAvailable: true when all slots in range are AVAILABLE', () => {
      const start = new Date('2026-10-25T03:00:00.000Z');
      const end = new Date('2026-10-25T04:00:00.000Z');
      const res = checkRangeAvailability(start, end, slots);
      expect(res.isAvailable).toBe(true);
    });

    it('returns BOOKED_SLOT when a slot within range is BOOKED', () => {
      const start = new Date('2026-10-25T03:00:00.000Z');
      const end = new Date('2026-10-25T05:00:00.000Z');
      const res = checkRangeAvailability(start, end, slots);
      expect(res.isAvailable).toBe(false);
      expect(res.reason).toBe('BOOKED_SLOT');
      expect(res.conflictingSlot?.startTime).toBe('2026-10-25T04:00:00.000Z');
    });

    it('returns MISSING_SLOT when requested range exceeds loaded slots', () => {
      const start = new Date('2026-10-25T04:30:00.000Z');
      const end = new Date('2026-10-25T05:30:00.000Z'); // 05:00 to 05:30 is missing
      const res = checkRangeAvailability(start, end, slots);
      expect(res.isAvailable).toBe(false);
      expect(res.reason).toBe('MISSING_SLOT');
    });
  });
});
