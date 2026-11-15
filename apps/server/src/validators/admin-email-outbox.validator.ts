import { z } from 'zod';
import { EmailOutboxKind, EmailOutboxStatus } from '@prisma/client';
import { positiveIntSchema, MYSQL_INT_MAX } from './room.validator.js';

export const getEmailOutboxQuerySchema = z
  .object({
    page: positiveIntSchema('page').default(1),
    limit: positiveIntSchema('limit')
      .refine((n) => n >= 1 && n <= 100, 'limit phải từ 1 đến 100')
      .default(20),
    kind: z.nativeEnum(EmailOutboxKind).optional(),
    status: z.nativeEnum(EmailOutboxStatus).optional(),
    bookingId: z.string().uuid('bookingId phải là UUID hợp lệ').optional(),
  })
  .strict()
  .refine((data) => (data.page - 1) * data.limit <= MYSQL_INT_MAX, {
    message: 'page và limit tạo offset vượt quá giới hạn cho phép',
    path: ['page'],
  });

export const emailOutboxIdParamsSchema = z
  .object({ id: z.string().uuid('id phải là UUID hợp lệ') })
  .strict();

export type GetEmailOutboxQueryInput = z.infer<typeof getEmailOutboxQuerySchema>;
export type EmailOutboxIdParamsInput = z.infer<typeof emailOutboxIdParamsSchema>;
