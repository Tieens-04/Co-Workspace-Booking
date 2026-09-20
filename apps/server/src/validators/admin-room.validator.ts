import { z } from 'zod';
import { RoomStatus } from '@prisma/client';
import {
  MYSQL_INT_MAX,
  ROOM_PRICE_MAX_CENTS,
  moneyToCents,
  normalizeMoney,
} from './room.validator.js';

const capacitySchema = z
  .custom<number | string>(
    (val) => typeof val === 'number' || typeof val === 'string',
    'Sức chứa phải là số nguyên dương',
  )
  .transform((val, ctx) => {
    let num: number;
    if (typeof val === 'number') {
      if (!Number.isInteger(val) || val <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Sức chứa phải là số nguyên dương',
        });
        return z.NEVER;
      }
      num = val;
    } else {
      const trimmed = val.trim();
      if (!/^[1-9]\d*$/.test(trimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Sức chứa phải là số nguyên dương',
        });
        return z.NEVER;
      }
      num = Number(trimmed);
    }

    if (!Number.isSafeInteger(num) || num > MYSQL_INT_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sức chứa vượt quá giới hạn cho phép',
      });
      return z.NEVER;
    }

    return num;
  });

const pricePerHourSchema = z
  .custom<number | string>(
    (val) => typeof val === 'number' || typeof val === 'string',
    'Đơn giá phải là số hoặc chuỗi số',
  )
  .transform((val, ctx) => {
    let strVal: string;
    if (typeof val === 'number') {
      if (Number.isNaN(val) || !Number.isFinite(val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Đơn giá không hợp lệ',
        });
        return z.NEVER;
      }
      if (val < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Đơn giá phải là số tiền không âm với tối đa 2 chữ số thập phân',
        });
        return z.NEVER;
      }
      const parts = val.toString().split('.');
      if (parts.length > 1 && parts[1].length > 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Đơn giá tối đa 2 chữ số thập phân',
        });
        return z.NEVER;
      }
      strVal = val.toFixed(2);
    } else {
      strVal = val.trim();
      if (!/^\d+(\.\d{1,2})?$/.test(strVal)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Đơn giá phải là số tiền không âm với tối đa 2 chữ số thập phân',
        });
        return z.NEVER;
      }
    }

    const cents = moneyToCents(strVal);
    if (!Number.isSafeInteger(cents) || cents > ROOM_PRICE_MAX_CENTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Đơn giá vượt quá giới hạn cho phép',
      });
      return z.NEVER;
    }

    return normalizeMoney(strVal);
  });

const descriptionSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    const trimmed = val.trim();
    return trimmed === '' ? null : trimmed;
  });

export const roomImageInputSchema = z
  .object({
    imageUrl: z
      .string()
      .trim()
      .max(500, 'URL ảnh không được vượt quá 500 ký tự')
      .url('URL ảnh không đúng định dạng URL')
      .refine((url) => /^https?:\/\//i.test(url), {
        message: 'URL ảnh phải bắt đầu bằng http:// hoặc https://',
      }),
    isPrimary: z.boolean(),
  })
  .strict();

export const imagesSchema = z
  .array(roomImageInputSchema)
  .refine(
    (imgs) => {
      const urls = imgs.map((img) => img.imageUrl);
      return new Set(urls).size === urls.length;
    },
    {
      message: 'Danh sách ảnh không được chứa URL trùng lặp',
    },
  )
  .refine(
    (imgs) => {
      if (imgs.length === 0) return true;
      const primaryCount = imgs.filter((img) => img.isPrimary).length;
      return primaryCount === 1;
    },
    {
      message: 'Nếu phòng có ảnh, phải có duy nhất một ảnh chính (isPrimary = true)',
    },
  );

export const amenityIdsSchema = z
  .array(z.string().uuid('ID tiện ích không đúng định dạng UUID'))
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Danh sách tiện ích không được chứa ID trùng lặp',
  });

export const createRoomSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Tên phòng không được để trống')
      .max(191, 'Tên phòng tối đa 191 ký tự'),
    description: descriptionSchema,
    capacity: capacitySchema,
    pricePerHour: pricePerHourSchema,
    amenityIds: amenityIdsSchema.default([]),
    images: imagesSchema.default([]),
  })
  .strict();

export const updateRoomSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Tên phòng không được để trống')
      .max(191, 'Tên phòng tối đa 191 ký tự')
      .optional(),
    description: descriptionSchema,
    capacity: capacitySchema.optional(),
    pricePerHour: pricePerHourSchema.optional(),
    amenityIds: amenityIdsSchema.optional(),
    images: imagesSchema.optional(),
    status: z.nativeEnum(RoomStatus).optional(),
    acknowledgeFutureBookings: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Dữ liệu cập nhật không được để trống',
  })
  .refine(
    (data) => {
      if (data.acknowledgeFutureBookings !== undefined && data.status !== RoomStatus.MAINTENANCE) {
        return false;
      }
      return true;
    },
    {
      message: 'acknowledgeFutureBookings chỉ được sử dụng khi cập nhật trạng thái MAINTENANCE',
      path: ['acknowledgeFutureBookings'],
    },
  );

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
