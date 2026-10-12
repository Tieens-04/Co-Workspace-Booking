import { z } from 'zod';
import { BookingStatus } from '@prisma/client';
import { positiveIntSchema, MYSQL_INT_MAX, isValidCalendarDate } from './room.validator.js';

const noteSchema = z
  .union([z.string().trim().max(500, 'Ghi chú không được vượt quá 500 ký tự'), z.null()])
  .optional()
  .transform((val) => {
    if (val === undefined || val === null) return null;
    const trimmed = val.trim();
    return trimmed === '' ? null : trimmed;
  });

export const getAdminBookingsQuerySchema = z
  .object({
    page: positiveIntSchema('page').default(1),
    limit: positiveIntSchema('limit')
      .refine((n) => n >= 1 && n <= 100, 'limit phải từ 1 đến 100')
      .default(10),
    bookingCode: z
      .string()
      .max(191, 'Mã đặt phòng không được vượt quá 191 ký tự')
      .transform((val) => {
        const normalized = val.replace(/\s+/g, '').toUpperCase();
        return normalized.length === 0 ? undefined : normalized;
      })
      .optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date phải có định dạng YYYY-MM-DD')
      .refine(isValidCalendarDate, 'date phải là ngày thực tế hợp lệ')
      .optional(),
    status: z.nativeEnum(BookingStatus).optional(),
  })
  .strict()
  .refine((data) => (data.page - 1) * data.limit <= MYSQL_INT_MAX, {
    message: 'page và limit tạo offset vượt quá giới hạn cho phép',
    path: ['page'],
  });

export type GetAdminBookingsQueryInput = z.infer<typeof getAdminBookingsQuerySchema>;

export const createGuestBookingSchema = z
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
    guestName: z
      .string()
      .trim()
      .min(1, 'Tên khách hàng không được để trống')
      .max(191, 'Tên khách hàng không được vượt quá 191 ký tự'),
    guestPhone: z
      .string()
      .trim()
      .min(1, 'Số điện thoại không được để trống')
      .max(191, 'Số điện thoại không được vượt quá 191 ký tự'),
    note: noteSchema.default(null),
  })
  .strict();

export type CreateGuestBookingInput = z.infer<typeof createGuestBookingSchema>;
