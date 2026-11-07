import { z } from 'zod';

/**
 * Normalizes phone number by removing spaces, dots, and hyphens.
 */
export const normalizePhoneNumber = (raw: string): string => {
  return raw.replace(/[\s.-]/g, '');
};

/**
 * Vietnamese phone number format:
 * - Starts with 0 followed by 9 to 10 digits (total 10-11 digits).
 * - Or starts with +84 followed by 9 to 10 digits.
 * Rejects letters and invalid prefixes.
 */
export const VIETNAMESE_PHONE_REGEX = /^(?:0|\+84)\d{9,10}$/;

/**
 * Required phone schema for walk-in guest bookings.
 */
export const guestPhoneSchema = z
  .string({ message: 'Số điện thoại không được để trống' })
  .trim()
  .min(1, 'Số điện thoại không được để trống')
  .max(191, 'Số điện thoại không được vượt quá 191 ký tự')
  .transform(normalizePhoneNumber)
  .refine((val) => VIETNAMESE_PHONE_REGEX.test(val), {
    message: 'Số điện thoại không đúng định dạng',
  });

/**
 * Shared transformation logic for optional or nullable phone inputs:
 * - null or empty/whitespace string transforms to null.
 * - non-empty string is checked against VIETNAMESE_PHONE_REGEX and returned in normalized form.
 */
export const transformOptionalPhone = (
  val: string | null,
  ctx: z.RefinementCtx,
): string | null => {
  if (val === null) return null;
  const trimmed = val.trim();
  if (trimmed === '') return null;
  const normalized = normalizePhoneNumber(trimmed);
  if (!VIETNAMESE_PHONE_REGEX.test(normalized)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Số điện thoại không đúng định dạng',
    });
    return z.NEVER;
  }
  return normalized;
};

/**
 * Optional phone schema for registration:
 * - Undefined input is optional on DTO.
 * - Empty string or null turns into null.
 * - Non-empty string must match Vietnamese phone regex and is saved in normalized form.
 */
export const registerPhoneSchema = z
  .string()
  .max(191, 'Số điện thoại không được vượt quá 191 ký tự')
  .transform(transformOptionalPhone)
  .nullable()
  .optional();

/**
 * Phone schema for updating profile (/api/v1/me):
 * - Null or empty string clears the phone number (returns null).
 * - Non-empty string must match Vietnamese phone regex and is saved in normalized form.
 */
export const updateMePhoneSchema = z
  .union([z.string().max(191, 'Số điện thoại không được vượt quá 191 ký tự'), z.null()])
  .nullable()
  .transform(transformOptionalPhone);
