import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  VIETNAMESE_PHONE_REGEX,
  guestPhoneSchema,
  registerPhoneSchema,
  updateMePhoneSchema,
} from '../validators/phone.validator.js';

describe('Phone Validator & Normalization (CWB-74)', () => {
  describe('normalizePhoneNumber', () => {
    it('removes spaces, dots, and hyphens', () => {
      expect(normalizePhoneNumber('  0912 345 678  ')).toBe('0912345678');
      expect(normalizePhoneNumber('0912.345.678')).toBe('0912345678');
      expect(normalizePhoneNumber('0912-345-678')).toBe('0912345678');
      expect(normalizePhoneNumber('+84 912.345-678')).toBe('+84912345678');
    });
  });

  describe('VIETNAMESE_PHONE_REGEX', () => {
    it('accepts 9 to 10 digits after leading 0', () => {
      expect(VIETNAMESE_PHONE_REGEX.test('0912345678')).toBe(true); // 10 digits total
      expect(VIETNAMESE_PHONE_REGEX.test('02438255555')).toBe(true); // 11 digits total (landline)
    });

    it('accepts 9 to 10 digits after leading +84', () => {
      expect(VIETNAMESE_PHONE_REGEX.test('+84912345678')).toBe(true);
      expect(VIETNAMESE_PHONE_REGEX.test('+842438255555')).toBe(true);
    });

    it('rejects strings containing letters', () => {
      expect(VIETNAMESE_PHONE_REGEX.test('abc')).toBe(false);
      expect(VIETNAMESE_PHONE_REGEX.test('0912abc345')).toBe(false);
      expect(VIETNAMESE_PHONE_REGEX.test('+84912345abc')).toBe(false);
    });

    it('rejects too short or too long digit sequences', () => {
      expect(VIETNAMESE_PHONE_REGEX.test('012345678')).toBe(false); // only 8 digits after 0
      expect(VIETNAMESE_PHONE_REGEX.test('012345678901')).toBe(false); // 11 digits after 0
      expect(VIETNAMESE_PHONE_REGEX.test('+8412345678')).toBe(false); // only 8 digits after +84
      expect(VIETNAMESE_PHONE_REGEX.test('+8412345678901')).toBe(false); // 11 digits after +84
    });

    it('rejects phone numbers with foreign or missing prefixes', () => {
      expect(VIETNAMESE_PHONE_REGEX.test('1234567890')).toBe(false);
      expect(VIETNAMESE_PHONE_REGEX.test('+12345678901')).toBe(false);
    });
  });

  describe('guestPhoneSchema', () => {
    it('rejects empty or whitespace-only phone with required error message', () => {
      const resEmpty = guestPhoneSchema.safeParse('');
      expect(resEmpty.success).toBe(false);
      if (!resEmpty.success) {
        expect(resEmpty.error.issues[0].message).toBe('Số điện thoại không được để trống');
      }

      const resSpace = guestPhoneSchema.safeParse('   ');
      expect(resSpace.success).toBe(false);
      if (!resSpace.success) {
        expect(resSpace.error.issues[0].message).toBe('Số điện thoại không được để trống');
      }
    });

    it('rejects phone longer than 191 characters', () => {
      const res = guestPhoneSchema.safeParse('09' + '1'.repeat(195));
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe('Số điện thoại không được vượt quá 191 ký tự');
      }
    });

    it('rejects invalid format (such as "abc" or punctuation only "- .") with invalid format message', () => {
      const res = guestPhoneSchema.safeParse('abc');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe('Số điện thoại không đúng định dạng');
      }

      const resPunct = guestPhoneSchema.safeParse('- .');
      expect(resPunct.success).toBe(false);
      if (!resPunct.success) {
        expect(resPunct.error.issues[0].message).toBe('Số điện thoại không đúng định dạng');
      }
    });

    it('normalizes valid phone with spaces/dots/hyphens and returns normalized string', () => {
      const res1 = guestPhoneSchema.safeParse('0912 345 678');
      expect(res1.success).toBe(true);
      if (res1.success) {
        expect(res1.data).toBe('0912345678');
      }

      const res2 = guestPhoneSchema.safeParse('+84 912.345-678');
      expect(res2.success).toBe(true);
      if (res2.success) {
        expect(res2.data).toBe('+84912345678');
      }
    });
  });

  describe('registerPhoneSchema', () => {
    it('converts undefined to undefined, and null or empty string to null', () => {
      expect(registerPhoneSchema.parse(undefined)).toBeUndefined();
      expect(registerPhoneSchema.parse(null)).toBeNull();
      expect(registerPhoneSchema.parse('')).toBeNull();
      expect(registerPhoneSchema.parse('   ')).toBeNull();
    });

    it('rejects invalid format', () => {
      const res = registerPhoneSchema.safeParse('abc');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe('Số điện thoại không đúng định dạng');
      }

      const resPunct = registerPhoneSchema.safeParse('- .');
      expect(resPunct.success).toBe(false);
      if (!resPunct.success) {
        expect(resPunct.error.issues[0].message).toBe('Số điện thoại không đúng định dạng');
      }
    });

    it('normalizes valid phone', () => {
      expect(registerPhoneSchema.parse('0912.345.678')).toBe('0912345678');
      expect(registerPhoneSchema.parse('+84 912 345 678')).toBe('+84912345678');
    });
  });

  describe('updateMePhoneSchema', () => {
    it('converts null and empty string to null (clearing the phone)', () => {
      expect(updateMePhoneSchema.parse(null)).toBeNull();
      expect(updateMePhoneSchema.parse('')).toBeNull();
      expect(updateMePhoneSchema.parse('   ')).toBeNull();
    });

    it('rejects invalid format', () => {
      const res = updateMePhoneSchema.safeParse('abc');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe('Số điện thoại không đúng định dạng');
      }

      const resPunct = updateMePhoneSchema.safeParse('- .');
      expect(resPunct.success).toBe(false);
      if (!resPunct.success) {
        expect(resPunct.error.issues[0].message).toBe('Số điện thoại không đúng định dạng');
      }
    });

    it('normalizes valid phone', () => {
      expect(updateMePhoneSchema.parse('0912-345-678')).toBe('0912345678');
    });
  });
});
