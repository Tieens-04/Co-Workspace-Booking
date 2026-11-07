import { z } from 'zod';
import { passwordSchema } from './auth.validator.js';
import { updateMePhoneSchema } from './phone.validator.js';

/** Only contact details are editable; role, email, id and password hash are never accepted here. */
export const updateMeBodySchema = z
  .object({
    fullName: z.string().trim().min(1, 'Họ và tên không được để trống').max(191),
    // Empty string clears the phone number.
    phoneNumber: updateMePhoneSchema,
  })
  .partial()
  .strict()
  .refine((data) => data.fullName !== undefined || data.phoneNumber !== undefined, {
    message: 'Cần ít nhất một trường để cập nhật',
  });

export const changePasswordBodySchema = z
  .object({
    currentPassword: passwordSchema.min(1, 'Mật khẩu hiện tại không được để trống'),
    newPassword: passwordSchema.min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự'),
  })
  .strict()
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    path: ['newPassword'],
  });

export const meQuerySchema = z.object({}).strict();

/** `POST /me/logout-all` takes no input; the account always comes from the verified JWT. */
export const logoutAllBodySchema = z.object({}).strict();

export type UpdateMeInput = z.infer<typeof updateMeBodySchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordBodySchema>;
