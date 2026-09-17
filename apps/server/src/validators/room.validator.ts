import { z } from 'zod';

const MYSQL_INT_MAX = 2_147_483_647;
const ROOM_PRICE_MAX_CENTS = 9_999_999_999;

const positiveIntSchema = (field: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, `${field} phải là số nguyên dương`)
    .refine((value) => {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed <= MYSQL_INT_MAX;
    }, `${field} vượt quá giới hạn cho phép`)
    .transform(Number);

const moneyToCents = (value: string): number => {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};

const normalizeMoney = (value: string): string => {
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

export type GetRoomsQueryInput = z.infer<typeof getRoomsQuerySchema>;
export type GetRoomByIdParamsInput = z.infer<typeof getRoomByIdParamsSchema>;
