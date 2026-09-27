import { z } from 'zod';
import { positiveIntSchema, MYSQL_INT_MAX } from './room.validator.js';

const noteSchema = z
  .union([z.string().trim().max(500, 'Ghi chú không được vượt quá 500 ký tự'), z.null()])
  .optional()
  .transform((val) => {
    if (val === undefined || val === null) return null;
    const trimmed = val.trim();
    return trimmed === '' ? null : trimmed;
  });

export const createBookingSchema = z
  .object({
    roomId: z.string().uuid('ID phòng không đúng định dạng UUID'),
    startTime: z.string().datetime({
      offset: true,
      message: 'Thời gian bắt đầu không đúng định dạng ISO 8601',
    }),
    endTime: z.string().datetime({
      offset: true,
      message: 'Thời gian kết thúc không đúng định dạng ISO 8601',
    }),
    note: noteSchema.default(null),
  })
  .strict();

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const bookingHistoryViewSchema = z.enum(['ALL', 'UPCOMING', 'COMPLETED']);
export type BookingHistoryViewInput = z.infer<typeof bookingHistoryViewSchema>;

export const getBookingsQuerySchema = z
  .object({
    page: positiveIntSchema('page').default(1),
    limit: positiveIntSchema('limit')
      .refine((n) => n >= 1 && n <= 100, 'limit phải từ 1 đến 100')
      .default(10),
    view: bookingHistoryViewSchema.default('ALL'),
  })
  .strict()
  .refine((data) => (data.page - 1) * data.limit <= MYSQL_INT_MAX, {
    message: 'page và limit tạo offset vượt quá giới hạn cho phép',
    path: ['page'],
  });

export type GetBookingsQueryInput = z.infer<typeof getBookingsQuerySchema>;

export const getBookingByIdParamsSchema = z
  .object({
    id: z.string().uuid('ID đặt phòng không đúng định dạng UUID'),
  })
  .strict();

export type GetBookingByIdParamsInput = z.infer<typeof getBookingByIdParamsSchema>;

export const getBookingByIdQuerySchema = z.object({}).strict();
export type GetBookingByIdQueryInput = z.infer<typeof getBookingByIdQuerySchema>;
