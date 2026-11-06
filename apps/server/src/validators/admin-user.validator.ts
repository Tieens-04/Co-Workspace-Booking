import { z } from 'zod';
import { Role } from '@prisma/client';
import { positiveIntSchema, MYSQL_INT_MAX } from './room.validator.js';
import { ACCOUNT_STATUSES } from '../types/admin-user.type.js';

/** Trimmed free-text search; blank means "no filter". */
const searchTextSchema = (field: string) =>
  z
    .string()
    .max(191, `${field} không được vượt quá 191 ký tự`)
    .transform((val) => {
      const normalized = val.trim();
      return normalized.length === 0 ? undefined : normalized;
    })
    .optional();

export const getAdminUsersQuerySchema = z
  .object({
    page: positiveIntSchema('page').default(1),
    limit: positiveIntSchema('limit')
      .refine((n) => n >= 1 && n <= 100, 'limit phải từ 1 đến 100')
      .default(20),
    q: searchTextSchema('Từ khóa tìm kiếm'),
    role: z.nativeEnum(Role).optional(),
    status: z.enum(ACCOUNT_STATUSES).optional(),
  })
  .strict()
  .refine((data) => (data.page - 1) * data.limit <= MYSQL_INT_MAX, {
    message: 'page và limit tạo offset vượt quá giới hạn cho phép',
    path: ['page'],
  });

export const adminUserIdParamsSchema = z
  .object({ id: z.string().uuid('ID tài khoản không đúng định dạng UUID') })
  .strict();

export const updateUserStatusBodySchema = z
  .object({
    status: z.enum(ACCOUNT_STATUSES, { message: 'Trạng thái phải là ACTIVE hoặc LOCKED' }),
    reason: z
      .string({ message: 'Lý do không được để trống' })
      .trim()
      .min(1, 'Lý do không được để trống')
      .max(500, 'Lý do không được vượt quá 500 ký tự'),
  })
  .strict();

export type GetAdminUsersQueryInput = z.infer<typeof getAdminUsersQuerySchema>;
export type AdminUserIdParamsInput = z.infer<typeof adminUserIdParamsSchema>;
export type UpdateUserStatusBodyInput = z.infer<typeof updateUserStatusBodySchema>;
