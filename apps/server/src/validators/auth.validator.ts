import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().max(191).email('Email không đúng định dạng');
const passwordSchema = z.string().refine((val) => Buffer.byteLength(val, 'utf8') <= 72, {
  message: 'Mật khẩu không được vượt quá 72 bytes',
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema.min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
    fullName: z.string().trim().min(1, 'Họ và tên không được để trống').max(191),
    phoneNumber: z.string().trim().max(191).optional().nullable(),
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
