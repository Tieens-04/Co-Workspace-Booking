import { z } from 'zod';
import { registerPhoneSchema } from './phone.validator.js';

const emailSchema = z.string().trim().toLowerCase().max(191).email('Email không đúng định dạng');
export const passwordSchema = z.string().refine((val) => Buffer.byteLength(val, 'utf8') <= 72, {
  message: 'Mật khẩu không được vượt quá 72 bytes',
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema.min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
    fullName: z.string().trim().min(1, 'Họ và tên không được để trống').max(191),
    phoneNumber: registerPhoneSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema.min(1, 'Mật khẩu không được để trống'),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export const resetPasswordSchema = z
  .object({
    // 32 random bytes encoded as base64url (43 characters).
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Liên kết đặt lại mật khẩu không hợp lệ'),
    newPassword: passwordSchema.min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự'),
  })
  .strict();

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
