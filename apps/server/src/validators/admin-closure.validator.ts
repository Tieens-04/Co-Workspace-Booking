import { z } from 'zod';
import { positiveIntSchema, MYSQL_INT_MAX } from './room.validator.js';

const isoDateTimeSchema = (fieldName: string) =>
  z.string().datetime({
    offset: true,
    message: `${fieldName} không đúng định dạng ISO 8601`,
  });

const roomIdValueSchema = z
  .union([z.string().uuid('ID phòng không đúng định dạng UUID'), z.literal(''), z.null()])
  .transform((val) => (val && val !== '' ? val : null));

const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Lý do đóng cửa không được để trống')
  .max(500, 'Lý do đóng cửa không được vượt quá 500 ký tự');

export const createClosureSchema = z
  .object({
    roomId: roomIdValueSchema.optional().transform((val) => val ?? null),
    startTime: isoDateTimeSchema('Thời gian bắt đầu'),
    endTime: isoDateTimeSchema('Thời gian kết thúc'),
    reason: reasonSchema,
    acknowledgeConflictingBookings: z.boolean().optional().default(false),
  })
  .strict()
  .refine((data) => new Date(data.endTime).getTime() > new Date(data.startTime).getTime(), {
    message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
    path: ['endTime'],
  });

export const updateClosureSchema = z
  .object({
    roomId: roomIdValueSchema.optional(),
    startTime: isoDateTimeSchema('Thời gian bắt đầu').optional(),
    endTime: isoDateTimeSchema('Thời gian kết thúc').optional(),
    reason: reasonSchema.optional(),
    acknowledgeConflictingBookings: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.roomId !== undefined ||
      data.startTime !== undefined ||
      data.endTime !== undefined ||
      data.reason !== undefined,
    {
      message: 'Cần cung cấp ít nhất một trường cập nhật',
    },
  )
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return new Date(data.endTime).getTime() > new Date(data.startTime).getTime();
      }
      return true;
    },
    {
      message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
      path: ['endTime'],
    },
  );

export const closureIdParamsSchema = z
  .object({
    id: z.string().uuid('ID khung đóng cửa không đúng định dạng UUID'),
  })
  .strict();

export const getClosuresQuerySchema = z
  .object({
    page: positiveIntSchema('page').default(1),
    limit: positiveIntSchema('limit')
      .refine((n) => n >= 1 && n <= 100, 'limit phải từ 1 đến 100')
      .default(20),
    roomId: z.string().uuid('ID phòng không đúng định dạng UUID').optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    upcoming: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .optional()
      .transform((val) => (val === undefined ? undefined : val === true || val === 'true')),
  })
  .strict()
  .refine((data) => (data.page - 1) * data.limit <= MYSQL_INT_MAX, {
    message: 'page và limit tạo offset vượt quá giới hạn cho phép',
    path: ['page'],
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return new Date(data.to).getTime() > new Date(data.from).getTime();
      }
      return true;
    },
    {
      message: 'Thời gian kết thúc lọc phải sau thời gian bắt đầu lọc',
      path: ['to'],
    },
  );
