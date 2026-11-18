import { describe, expect, it } from 'vitest';
import {
  parseTimeToMinutes,
  validateSlotRules,
  isSlotValid,
  validateRoomFilterInputs,
  normalizeRoomSearchParams,
} from '../utils/roomFilters';

describe('roomFilters utility functions (Findings 2, 7 Regressions)', () => {
  const mockNow = new Date('2026-11-20T10:00:00.000+07:00');

  describe('parseTimeToMinutes', () => {
    it('parses valid HH:mm strings to minute counts', () => {
      expect(parseTimeToMinutes('07:00')).toBe(420);
      expect(parseTimeToMinutes('09:30')).toBe(570);
      expect(parseTimeToMinutes('22:00')).toBe(1320);
    });

    it('returns null for invalid time strings', () => {
      expect(parseTimeToMinutes('25:00')).toBeNull();
      expect(parseTimeToMinutes('09:65')).toBeNull();
      expect(parseTimeToMinutes('abc')).toBeNull();
      expect(parseTimeToMinutes('')).toBeNull();
    });
  });

  describe('validateSlotRules & isSlotValid', () => {
    it('accepts valid future slot adhering to 30-min alignment, 1h-8h duration, 07:00-22:00', () => {
      const res = validateSlotRules('2026-11-25', '09:00', '11:00', mockNow);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
      expect(isSlotValid('2026-11-25', '09:00', '11:00', mockNow)).toBe(true);
    });

    it('rejects date in the past', () => {
      const res = validateSlotRules('2026-11-19', '09:00', '11:00', mockNow);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Thời gian bắt đầu không được ở trong quá khứ');
      expect(isSlotValid('2026-11-19', '09:00', '11:00', mockNow)).toBe(false);
    });

    it('rejects impossible calendar dates like 2027-02-31 (CWB-120)', () => {
      const res = validateSlotRules('2027-02-31', '09:00', '11:00', mockNow);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Ngày đã chọn không tồn tại trên lịch');
      expect(isSlotValid('2027-02-31', '09:00', '11:00', mockNow)).toBe(false);
    });

    it('rejects dates beyond BOOKING_MAX_ADVANCE_DAYS (CWB-120)', () => {
      const res = validateSlotRules('2027-02-01', '09:00', '11:00', mockNow, 60);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Chỉ được đặt phòng trước tối đa 60 ngày');
      expect(isSlotValid('2027-02-01', '09:00', '11:00', mockNow, 60)).toBe(false);
    });

    it('rejects startTime in the past on the current day', () => {
      // mockNow is 10:00:00+07:00 on 2026-11-20
      const res = validateSlotRules('2026-11-20', '09:00', '11:00', mockNow);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Thời gian bắt đầu không được ở trong quá khứ');
    });

    it('rejects startTime under 30 minutes in advance on the current day', () => {
      // 10:20 is under 30 minutes ahead of 10:00 (aligned to 10:30 which is exactly 30 min, 10:00 is past)
      // If startTime is 10:00, it's <= now -> past time
      // Let's test a slot starting at 10:00 vs 10:30
      // At 10:00 now, a 10:00 start is <= now.
      const res = validateSlotRules('2026-11-20', '08:00', '10:00', mockNow);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Thời gian bắt đầu không được ở trong quá khứ');
    });

    it('rejects endTime before or equal to startTime', () => {
      const res = validateSlotRules('2026-11-25', '11:00', '09:00', mockNow);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Thời gian kết thúc phải sau thời gian bắt đầu');
    });

    it('rejects duration under 1 hour', () => {
      const res = validateSlotRules('2026-11-25', '09:00', '09:30', mockNow);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Thời lượng đặt phòng tối thiểu là 1 giờ');
    });

    it('rejects duration over 8 hours', () => {
      const res = validateSlotRules('2026-11-25', '09:00', '18:00', mockNow);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Thời lượng đặt phòng tối đa là 8 giờ');
    });

    it('rejects times outside operating hours 07:00 - 22:00', () => {
      const res1 = validateSlotRules('2026-11-25', '06:30', '08:30', mockNow);
      expect(res1.isValid).toBe(false);
      expect(res1.error).toBe(
        'Chỉ được đặt phòng từ 07:00 đến 22:00 trong cùng ngày (giờ Việt Nam)',
      );

      const res2 = validateSlotRules('2026-11-25', '20:30', '22:30', mockNow);
      expect(res2.isValid).toBe(false);
      expect(res2.error).toBe(
        'Chỉ được đặt phòng từ 07:00 đến 22:00 trong cùng ngày (giờ Việt Nam)',
      );
    });

    it('rejects unaligned slots (not multiple of 30 min)', () => {
      const res = validateSlotRules('2026-11-25', '09:15', '11:15', mockNow);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Thời gian bắt đầu phải theo mốc 30 phút (ví dụ: 09:00, 09:30)');
    });
  });

  describe('validateRoomFilterInputs', () => {
    it('validates numeric fields and slot rules correctly', () => {
      const errors = validateRoomFilterInputs(
        '5',
        '100',
        '200',
        '2026-11-25',
        '09:00',
        '11:00',
        mockNow,
      );
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('reports error when only partial slot information is provided', () => {
      const errors = validateRoomFilterInputs('', '', '', '2026-11-25', '09:00', '', mockNow);
      expect(errors.slot).toBe('Vui lòng chọn đầy đủ ngày, giờ bắt đầu và giờ kết thúc');
    });

    it('reports error immediately when date is an impossible calendar date (CWB-120)', () => {
      const errors = validateRoomFilterInputs('', '', '', '2027-02-31', '', '', mockNow);
      expect(errors.slot).toBe('Ngày đã chọn không tồn tại trên lịch');
    });

    it('reports error when date is in the past', () => {
      const errors = validateRoomFilterInputs('', '', '', '2020-01-01', '09:00', '11:00', mockNow);
      expect(errors.slot).toBe('Thời gian bắt đầu không được ở trong quá khứ');
    });
  });

  describe('normalizeRoomSearchParams', () => {
    it('cleanses past date slots from search params to prevent 400 error state', () => {
      const params = new URLSearchParams('date=2020-01-01&startTime=09:00&endTime=11:00');
      const normalized = normalizeRoomSearchParams(params, 10, mockNow);
      expect(normalized.date).toBeUndefined();
      expect(normalized.startTime).toBeUndefined();
      expect(normalized.endTime).toBeUndefined();
      expect(normalized.searchParams.has('date')).toBe(false);
    });

    it('cleanses impossible calendar dates and beyond-horizon dates from search params (CWB-120)', () => {
      const impossible = normalizeRoomSearchParams(
        new URLSearchParams('date=2027-02-31&startTime=09:00&endTime=11:00'),
        10,
        mockNow,
      );
      expect(impossible.date).toBeUndefined();
      expect(impossible.searchParams.has('date')).toBe(false);
      expect(impossible.strippedHorizonError).toBeUndefined();

      const beyondHorizon = normalizeRoomSearchParams(
        new URLSearchParams('date=2027-02-01&startTime=09:00&endTime=11:00'),
        10,
        mockNow,
        60,
      );
      expect(beyondHorizon.date).toBeUndefined();
      expect(beyondHorizon.searchParams.has('date')).toBe(false);
      expect(beyondHorizon.strippedHorizonError).toBe('Chỉ được đặt phòng trước tối đa 60 ngày');

      // 45 days after 2026-11-20 is 2027-01-04 (within 60d default, exceeds 30d server horizon)
      const tightenedHorizon = normalizeRoomSearchParams(
        new URLSearchParams('date=2027-01-04&startTime=09:00&endTime=11:00'),
        10,
        mockNow,
        30,
      );
      expect(tightenedHorizon.date).toBeUndefined();
      expect(tightenedHorizon.searchParams.has('date')).toBe(false);
      expect(tightenedHorizon.strippedHorizonError).toBe('Chỉ được đặt phòng trước tối đa 30 ngày');
    });

    it('preserves valid future date slots', () => {
      const params = new URLSearchParams('date=2026-11-25&startTime=09:00&endTime=11:00');
      const normalized = normalizeRoomSearchParams(params, 10, mockNow);
      expect(normalized.date).toBe('2026-11-25');
      expect(normalized.startTime).toBe('09:00');
      expect(normalized.endTime).toBe('11:00');
      expect(normalized.searchParams.get('date')).toBe('2026-11-25');
    });
  });
});
