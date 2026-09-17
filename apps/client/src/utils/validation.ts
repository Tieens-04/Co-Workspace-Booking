import { z } from 'zod';

export const utf8ByteLength = (val: string): number => {
  return new TextEncoder().encode(val).length;
};

export const emailSchema = z
  .string({ error: 'Email không được để trống' })
  .trim()
  .toLowerCase()
  .max(191, 'Email không được vượt quá 191 ký tự')
  .email('Email không đúng định dạng');

export const basePasswordRule = z
  .string({ error: 'Mật khẩu không được để trống' })
  .refine((val) => utf8ByteLength(val) <= 72, {
    message: 'Mật khẩu không được vượt quá 72 bytes',
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: basePasswordRule.min(1, 'Mật khẩu không được để trống'),
});

export const registerSchema = z
  .object({
    fullName: z
      .string({ error: 'Họ và tên không được để trống' })
      .trim()
      .min(1, 'Họ và tên không được để trống')
      .max(191, 'Họ và tên không được vượt quá 191 ký tự'),
    email: emailSchema,
    phoneNumber: z
      .string()
      .max(191, 'Số điện thoại không được vượt quá 191 ký tự')
      .optional()
      .or(z.literal('')),
    password: basePasswordRule.min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
    confirmPassword: z
      .string({ error: 'Vui lòng xác nhận mật khẩu' })
      .min(1, 'Vui lòng xác nhận mật khẩu'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
