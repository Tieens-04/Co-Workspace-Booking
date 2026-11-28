import { z } from 'zod';
import { BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { positiveIntSchema, MYSQL_INT_MAX, isValidCalendarDate } from './room.validator.js';
import { guestPhoneSchema } from './phone.validator.js';

const noteSchema = z
  .union([z.string().trim().max(500, 'Ghi chú không được vượt quá 500 ký tự'), z.null()])
  .optional()
  .transform((val) => {
    if (val === undefined || val === null) return null;
    const trimmed = val.trim();
    return trimmed === '' ? null : trimmed;
  });

export const MAX_EXPORT_DAYS = 92;

const calendarDateSchema = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} phải có định dạng YYYY-MM-DD`)
    .refine(isValidCalendarDate, `${label} phải là ngày thực tế hợp lệ`);

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
      .refine((val) => val === undefined || val.length >= 4, 'Mã đặt phòng phải có ít nhất 4 ký tự')
      .optional(),
    date: calendarDateSchema('date').optional(),
    from: calendarDateSchema('from').optional(),
    to: calendarDateSchema('to').optional(),
    roomId: z.string().uuid('ID phòng không đúng định dạng UUID').optional(),
    paymentStatus: z.nativeEnum(PaymentStatus).optional(),
    status: z.nativeEnum(BookingStatus).optional(),
    needsAttention: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .optional(),
    needsRefund: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .optional(),
    // CWB-79: account email/name/phone or walk-in guest name/phone.
    customer: z
      .string()
      .max(191, 'Thông tin khách hàng không được vượt quá 191 ký tự')
      .transform((val) => {
        const normalized = val.trim();
        return normalized.length === 0 ? undefined : normalized;
      })
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if ((data.page - 1) * data.limit > MYSQL_INT_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'page và limit tạo offset vượt quá giới hạn cho phép',
        path: ['page'],
      });
    }

    if (data.date !== undefined && (data.from !== undefined || data.to !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Không thể dùng đồng thời date với from/to',
        path: ['date'],
      });
    }

    if ((data.from !== undefined) !== (data.to !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cần truyền đủ cả from và to để lọc theo khoảng ngày',
        path: [data.from === undefined ? 'from' : 'to'],
      });
    }

    if (data.from !== undefined && data.to !== undefined) {
      if (data.from > data.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'from không được sau to',
          path: ['from'],
        });
      } else if ((Date.parse(data.to) - Date.parse(data.from)) / 86_400_000 >= MAX_EXPORT_DAYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Khoảng ngày lọc tối đa ${MAX_EXPORT_DAYS} ngày`,
          path: ['to'],
        });
      }
    }
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
    guestPhone: guestPhoneSchema,
    note: noteSchema.default(null),
  })
  .strict();

export type CreateGuestBookingInput = z.infer<typeof createGuestBookingSchema>;

export const createAdminCustomerBookingSchema = z
  .object({
    customerId: z.string().uuid('ID khách hàng không đúng định dạng UUID'),
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

export type CreateAdminCustomerBookingInput = z.infer<typeof createAdminCustomerBookingSchema>;

export const confirmPaymentParamsSchema = z
  .object({
    id: z.string().uuid('ID đặt phòng không đúng định dạng UUID'),
  })
  .strict();

export type ConfirmPaymentParamsInput = z.infer<typeof confirmPaymentParamsSchema>;

export const confirmPaymentBodySchema = z
  .object({
    paymentMethod: z.nativeEnum(PaymentMethod, {
      message: 'Phương thức thanh toán phải là CASH hoặc QR',
    }),
  })
  .strict();

export type ConfirmPaymentBodyInput = z.infer<typeof confirmPaymentBodySchema>;

export const adminCancelBookingParamsSchema = z
  .object({
    id: z.string().uuid('ID đặt phòng không đúng định dạng UUID'),
  })
  .strict();

export type AdminCancelBookingParamsInput = z.infer<typeof adminCancelBookingParamsSchema>;

export const adminCancelBookingBodySchema = z
  .object({
    reason: z
      .string({ message: 'Lý do hủy không được để trống' })
      .trim()
      .min(1, 'Lý do hủy không được để trống')
      .max(500, 'Lý do hủy không được vượt quá 500 ký tự'),
  })
  .strict();

export type AdminCancelBookingBodyInput = z.infer<typeof adminCancelBookingBodySchema>;

export const completeBookingParamsSchema = z
  .object({
    id: z.string().uuid('ID đặt phòng không đúng định dạng UUID'),
  })
  .strict();

export type CompleteBookingParamsInput = z.infer<typeof completeBookingParamsSchema>;

export const completeBookingBodySchema = z.object({}).strict();
export type CompleteBookingBodyInput = z.infer<typeof completeBookingBodySchema>;

export const markNoShowParamsSchema = z
  .object({
    id: z.string().uuid('ID đặt phòng không đúng định dạng UUID'),
  })
  .strict();

export type MarkNoShowParamsInput = z.infer<typeof markNoShowParamsSchema>;

export const markNoShowBodySchema = z.object({}).strict();
export type MarkNoShowBodyInput = z.infer<typeof markNoShowBodySchema>;

// Booking mutation endpoints accept no query parameters.
export const adminBookingMutationQuerySchema = z.object({}).strict();
export type AdminBookingMutationQueryInput = z.infer<typeof adminBookingMutationQuerySchema>;

export const getRevenueQuerySchema = z
  .object({
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate phải có định dạng YYYY-MM-DD')
      .refine(isValidCalendarDate, 'startDate phải là ngày thực tế hợp lệ')
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate phải có định dạng YYYY-MM-DD')
      .refine(isValidCalendarDate, 'endDate phải là ngày thực tế hợp lệ')
      .optional(),
    roomId: z.string().uuid('ID phòng không đúng định dạng UUID').optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: 'startDate không được sau endDate',
      path: ['startDate'],
    },
  );

export type GetRevenueQueryInput = z.infer<typeof getRevenueQuerySchema>;

export const checkInBookingParamsSchema = completeBookingParamsSchema;
export type CheckInBookingParamsInput = z.infer<typeof checkInBookingParamsSchema>;
export const checkInBookingBodySchema = z.object({}).strict().optional();

/** CSV export filters (CWB-69): a bounded period is required. */
export const exportReportQuerySchema = z
  .object({
    startDate: calendarDateSchema('startDate'),
    endDate: calendarDateSchema('endDate'),
    roomId: z.string().uuid('ID phòng không đúng định dạng UUID').optional(),
    paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  })
  .strict()
  .refine((data) => data.startDate <= data.endDate, {
    message: 'startDate không được sau endDate',
    path: ['startDate'],
  })
  .refine(
    (data) =>
      (Date.parse(data.endDate) - Date.parse(data.startDate)) / 86_400_000 < MAX_EXPORT_DAYS,
    { message: `Kỳ xuất tối đa ${MAX_EXPORT_DAYS} ngày`, path: ['endDate'] },
  );

export type ExportReportQueryInput = z.infer<typeof exportReportQuerySchema>;

export const refundBookingParamsSchema = z
  .object({
    id: z.string().uuid('ID đặt phòng không đúng định dạng UUID'),
  })
  .strict();

export type RefundBookingParamsInput = z.infer<typeof refundBookingParamsSchema>;

export const refundBookingBodySchema = z
  .object({
    amount: z
      .union([
        z
          .number()
          .positive('Số tiền hoàn phải lớn hơn 0')
          .refine(
            (val) => Number.isFinite(val) && /^\d+(\.\d{1,2})?$/.test(val.toString()),
            'Số tiền hoàn không hợp lệ (tối đa 2 chữ số thập phân)',
          ),
        z.string().regex(/^\d+(\.\d{1,2})?$/, 'Số tiền hoàn không hợp lệ'),
      ])
      .refine((val) => Number(val) > 0, 'Số tiền hoàn phải lớn hơn 0'),
    method: z.nativeEnum(PaymentMethod, {
      message: 'Phương thức hoàn tiền phải là CASH hoặc QR',
    }),
    reason: z
      .string({ message: 'Lý do hoàn tiền không được để trống' })
      .trim()
      .min(1, 'Lý do hoàn tiền không được để trống')
      .max(500, 'Lý do hoàn tiền không được vượt quá 500 ký tự'),
  })
  .strict();

export type RefundBookingBodyInput = z.infer<typeof refundBookingBodySchema>;

export const adminRescheduleBookingParamsSchema = z
  .object({
    id: z.string().uuid('ID đặt phòng không đúng định dạng UUID'),
  })
  .strict();

export type AdminRescheduleBookingParamsInput = z.infer<typeof adminRescheduleBookingParamsSchema>;

export const adminRescheduleBookingBodySchema = z
  .object({
    startTime: z.string().datetime({
      offset: true,
      message: 'Thời gian bắt đầu không đúng định dạng ISO 8601',
    }),
    endTime: z.string().datetime({
      offset: true,
      message: 'Thời gian kết thúc không đúng định dạng ISO 8601',
    }),
    roomId: z.string().uuid('ID phòng không đúng định dạng UUID').optional(),
    reason: z
      .string({ message: 'Lý do đổi lịch không được để trống' })
      .trim()
      .min(1, 'Lý do đổi lịch không được để trống')
      .max(500, 'Lý do đổi lịch không được vượt quá 500 ký tự'),
    note: noteSchema.optional(),
    acknowledgePriceDelta: z.boolean().optional().default(false),
  })
  .strict();

export type AdminRescheduleBookingBodyInput = z.infer<typeof adminRescheduleBookingBodySchema>;
