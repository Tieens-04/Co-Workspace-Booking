import { z } from 'zod';

export const MYSQL_INT_MAX = 2_147_483_647;
export const ROOM_PRICE_MAX_CENTS = 9_999_999_999;

export const positiveIntSchema = (field: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, `${field} phải là số nguyên dương`)
    .refine((value) => {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed <= MYSQL_INT_MAX;
    }, `${field} vượt quá giới hạn cho phép`)
    .transform(Number);

export const moneyToCents = (value: string): number => {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};

export const normalizeMoney = (value: string): string => {
  const [whole, fraction = ''] = value.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  return `${normalizedWhole}.${fraction.padEnd(2, '0')}`;
};

const nonNegativeMoneySchema = (field: string) =>
  z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, `${field} phải là số tiền không âm với tối đa 2 chữ số thập phân`)
    .refine(
      (value) =>
        Number.isSafeInteger(moneyToCents(value)) && moneyToCents(value) <= ROOM_PRICE_MAX_CENTS,
      `${field} vượt quá giới hạn cho phép`,
    )
    .transform(normalizeMoney);

export const getRoomsQuerySchema = z
  .object({
    page: positiveIntSchema('page').default(1),
    limit: positiveIntSchema('limit')
      .refine((n) => n >= 1 && n <= 100, 'limit phải từ 1 đến 100')
      .default(10),
    capacity: positiveIntSchema('capacity').optional(),
    minPrice: nonNegativeMoneySchema('minPrice').optional(),
    maxPrice: nonNegativeMoneySchema('maxPrice').optional(),
    amenityIds: z
      .string()
      .refine((val) => val.trim().length > 0, 'amenityIds không được để trống')
      .transform((val, ctx) => {
        const rawParts = val.split(',').map((s) => s.trim());
        const deduped: string[] = [];
        for (const part of rawParts) {
          if (!z.string().uuid().safeParse(part).success) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `UUID '${part}' không hợp lệ trong amenityIds`,
            });
            return z.NEVER;
          }
          if (!deduped.includes(part)) {
            deduped.push(part);
          }
        }
        return deduped;
      })
      .optional(),
  })
  .strict()
  .refine((data) => (data.page - 1) * data.limit <= MYSQL_INT_MAX, {
    message: 'page và limit tạo offset vượt quá giới hạn cho phép',
    path: ['page'],
  })
  .refine(
    (data) => {
      if (data.minPrice !== undefined && data.maxPrice !== undefined) {
        return moneyToCents(data.minPrice) <= moneyToCents(data.maxPrice);
      }
      return true;
    },
    {
      message: 'minPrice không được lớn hơn maxPrice',
      path: ['minPrice'],
    },
  );

export const getRoomByIdParamsSchema = z
  .object({
    id: z.string().uuid('ID phòng không đúng định dạng UUID'),
  })
  .strict();

export const isValidCalendarDate = (val: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return false;
  }
  const [yStr, mStr, dStr] = val.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  if (month < 1 || month > 12) {
    return false;
  }

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return day >= 1 && day <= daysInMonth[month - 1];
};

export const getRoomAvailabilityQuerySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date phải có định dạng YYYY-MM-DD')
      .refine(isValidCalendarDate, 'date phải là ngày thực tế hợp lệ'),
  })
  .strict();

export type GetRoomsQueryInput = z.infer<typeof getRoomsQuerySchema>;
export type GetRoomByIdParamsInput = z.infer<typeof getRoomByIdParamsSchema>;
export type GetRoomAvailabilityQueryInput = z.infer<typeof getRoomAvailabilityQuerySchema>;
