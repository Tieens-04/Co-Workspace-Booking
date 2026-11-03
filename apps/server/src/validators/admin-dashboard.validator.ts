import { z } from 'zod';
import { isValidCalendarDate, MYSQL_INT_MAX, positiveIntSchema } from './room.validator.js';

export const DEFAULT_SCHEDULE_ROOMS_PER_PAGE = 20;
export const MAX_SCHEDULE_ROOMS_PER_PAGE = 50;

export const getDashboardKpiQuerySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date phải có định dạng YYYY-MM-DD')
      .refine(isValidCalendarDate, 'date phải là ngày thực tế hợp lệ')
      .optional(),
    period: z.enum(['day', 'week']).default('day'),
  })
  .strict();

export const getDashboardScheduleQuerySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date phải có định dạng YYYY-MM-DD')
      .refine(isValidCalendarDate, 'date phải là ngày thực tế hợp lệ')
      .optional(),
    // CWB-57: the schedule is paginated by room so large catalogs stay bounded.
    page: positiveIntSchema('page').default(1),
    limit: positiveIntSchema('limit')
      .refine(
        (n) => n >= 1 && n <= MAX_SCHEDULE_ROOMS_PER_PAGE,
        `limit phải từ 1 đến ${MAX_SCHEDULE_ROOMS_PER_PAGE}`,
      )
      .default(DEFAULT_SCHEDULE_ROOMS_PER_PAGE),
  })
  .strict()
  .refine((data) => (data.page - 1) * data.limit <= MYSQL_INT_MAX, {
    message: 'page và limit tạo offset vượt quá giới hạn cho phép',
    path: ['page'],
  });

export type GetDashboardKpiQuery = z.infer<typeof getDashboardKpiQuerySchema>;
export type GetDashboardScheduleQuery = z.infer<typeof getDashboardScheduleQuerySchema>;
