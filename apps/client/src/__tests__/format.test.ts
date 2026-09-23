import { describe, it, expect } from 'vitest';
import { formatCurrency, formatVnd } from '../utils/format';

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
});
