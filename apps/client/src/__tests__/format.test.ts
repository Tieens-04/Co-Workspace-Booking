import { describe, it, expect } from 'vitest';
import { formatCurrency, formatHoursFromMinutes, formatVnd } from '../utils/format';

describe('format utility', () => {
  describe('formatCurrency', () => {
    it('formats valid positive numbers and numeric strings to VND currency', () => {
      expect(formatCurrency(400000)).toMatch(/400\.000\s*đ/);
      expect(formatCurrency('400000.00')).toMatch(/400\.000\s*đ/);
      expect(formatCurrency(0)).toMatch(/0\s*đ/);
      expect(formatCurrency('0')).toMatch(/0\s*đ/);
    });

    it('returns "0 đ" for NaN, empty, or non-numeric values', () => {
      expect(formatCurrency(NaN)).toBe('0 đ');
      expect(formatCurrency('abc')).toBe('0 đ');
      expect(formatCurrency('')).toBe('0 đ');
    });

    it('returns "0 đ" for infinite or overflow values without producing "∞ đ"', () => {
      expect(formatCurrency(Infinity)).toBe('0 đ');
      expect(formatCurrency(-Infinity)).toBe('0 đ');
      expect(formatCurrency('Infinity')).toBe('0 đ');
      expect(formatCurrency('9'.repeat(400))).toBe('0 đ');
    });
  });

  describe('formatVnd', () => {
    it('formats valid hourly rates to VND per hour', () => {
      expect(formatVnd(200000)).toMatch(/200\.000\s*đ\/giờ/);
      expect(formatVnd('200000')).toMatch(/200\.000\s*đ\/giờ/);
    });

    it('returns "0 đ/giờ" for NaN, infinite, or invalid values', () => {
      expect(formatVnd(NaN)).toBe('0 đ/giờ');
      expect(formatVnd(Infinity)).toBe('0 đ/giờ');
      expect(formatVnd('Infinity')).toBe('0 đ/giờ');
      expect(formatVnd('abc')).toBe('0 đ/giờ');
    });
  });

  describe('formatHoursFromMinutes', () => {
    it('formats exact hour multiples without a trailing ",0" decimal', () => {
      expect(formatHoursFromMinutes(60)).toBe('1');
      expect(formatHoursFromMinutes(2880)).toBe('48');
      expect(formatHoursFromMinutes(20160)).toBe('336');
    });

    it('rounds fractional room-minutes to 1 decimal place in vi-VN locale', () => {
      expect(formatHoursFromMinutes(3886.048083333333)).toBe('64,8');
      expect(formatHoursFromMinutes(90)).toBe('1,5');
      expect(formatHoursFromMinutes(1224)).toBe('20,4');
      expect(formatHoursFromMinutes(7660)).toBe('127,7');
      expect(formatHoursFromMinutes(86.9)).toBe('1,4');
      expect(formatHoursFromMinutes(2)).toBe('0');
    });

    it('formats multi-room weekly totals with vi-VN thousands separators', () => {
      expect(formatHoursFromMinutes(100800)).toBe('1.680');
    });

    it('returns "0" for zero, negative, NaN, or infinite values', () => {
      expect(formatHoursFromMinutes(0)).toBe('0');
      expect(formatHoursFromMinutes(-0)).toBe('0');
      expect(formatHoursFromMinutes(-30)).toBe('0');
      expect(formatHoursFromMinutes(NaN)).toBe('0');
      expect(formatHoursFromMinutes(Infinity)).toBe('0');
      expect(formatHoursFromMinutes(-Infinity)).toBe('0');
    });
  });
});
