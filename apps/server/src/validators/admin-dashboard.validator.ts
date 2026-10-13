import { z } from 'zod';
import { isValidCalendarDate } from './room.validator.js';

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
  })
  .strict();

export type GetDashboardKpiQuery = z.infer<typeof getDashboardKpiQuerySchema>;
export type GetDashboardScheduleQuery = z.infer<typeof getDashboardScheduleQuerySchema>;
