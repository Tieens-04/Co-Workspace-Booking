import { z } from 'zod';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../repositories/audit.repository.js';
import { positiveIntSchema, MYSQL_INT_MAX } from './room.validator.js';

export const getAuditEventsQuerySchema = z
  .object({
    page: positiveIntSchema('page').default(1),
    limit: positiveIntSchema('limit')
      .refine((n) => n >= 1 && n <= 100, 'limit phải từ 1 đến 100')
      .default(20),
    entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
    entityId: z
      .string()
      .trim()
      .min(1, 'entityId không được để trống')
      .max(191, 'entityId không được vượt quá 191 ký tự')
      .optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
  })
  .strict()
  .refine((data) => (data.page - 1) * data.limit <= MYSQL_INT_MAX, {
    message: 'page và limit tạo offset vượt quá giới hạn cho phép',
    path: ['page'],
  });

export type GetAuditEventsQueryInput = z.infer<typeof getAuditEventsQuerySchema>;
