import { z } from 'zod';
import { RoomStatus } from '@prisma/client';
import { isSlotAligned, validateBookingTime } from '../utils/booking-time.util.js';
import { AppError } from '../utils/error.util.js';
import { FindRoomsFilter, RoomSortOption } from '../types/room.type.js';

export const MYSQL_INT_MAX = 2_147_483_647;
export const ROOM_PRICE_MAX_CENTS = 9_999_999_999;
export const ROOM_SORT_OPTIONS = [
  'price_asc',
  'price_desc',
  'capacity_asc',
  'capacity_desc',
  'newest',
] as const;

export const padTime = (t: string): string => (t.length === 5 ? `${t}:00` : t);

function determineSlotErrorPath(
  err: AppError,
  startDate: Date,
  endDate: Date,
): ['date'] | ['startTime'] | ['endTime'] {
  if (err.code === 'BOOKING_HORIZON') {
    return ['date'];
  }
  if (
    err.code === 'MIN_DURATION' ||
    err.code === 'MAX_DURATION' ||
    err.message.includes('kết thúc')
  ) {
    return ['endTime'];
  }
  if (err.code === 'OUTSIDE_OPERATING_HOURS') {
    const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
    const localEnd = new Date(endDate.getTime() + VIETNAM_OFFSET_MS);
    const endMinutes = localEnd.getUTCHours() * 60 + localEnd.getUTCMinutes();
    if (endMinutes > 22 * 60) {
      return ['endTime'];
    }
    return ['startTime'];
  }
  if (!isSlotAligned(endDate) && isSlotAligned(startDate)) {
    return ['endTime'];
  }
  return ['startTime'];
}

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

const roomsQueryBaseShape = {
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
  q: z
    .string()
    .trim()
    .max(100, 'Từ khóa tìm kiếm không được vượt quá 100 ký tự')
    .optional(),
  sort: z
    .enum(ROOM_SORT_OPTIONS, {
      message: 'Giá trị sắp xếp không hợp lệ',
    })
    .default('newest'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date phải có định dạng YYYY-MM-DD')
    .refine(isValidCalendarDate, 'date phải là ngày thực tế hợp lệ')
    .optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'startTime phải có định dạng HH:mm')
    .optional(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'endTime phải có định dạng HH:mm')
    .optional(),
};

type RoomsQueryBase = {
  page: number;
  limit: number;
  minPrice?: string;
  maxPrice?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  q?: string;
  capacity?: number;
  amenityIds?: string[];
  sort?: RoomSortOption;
  status?: RoomStatus;
};

function toFindRoomsFilter<T extends RoomsQueryBase>(data: T): FindRoomsFilter {
  const { date, startTime, endTime, q, status, ...rest } = data;
  const filter: FindRoomsFilter = { ...rest };
  if (q !== undefined && q !== '') {
    filter.q = q;
  }
  if (status !== undefined) {
    filter.status = status;
  }
  if (date && startTime && endTime) {
    filter.startDate = new Date(`${date}T${padTime(startTime)}.000+07:00`);
    filter.endDate = new Date(`${date}T${padTime(endTime)}.000+07:00`);
  }
  return filter;
}

function refineRoomsQuery<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema
    .strict()
    .refine(
      (arg) => {
        const data = arg as unknown as RoomsQueryBase;
        return (data.page - 1) * data.limit <= MYSQL_INT_MAX;
      },
      {
        message: 'page và limit tạo offset vượt quá giới hạn cho phép',
        path: ['page'],
      },
    )
    .refine(
      (arg) => {
        const data = arg as unknown as RoomsQueryBase;
        if (data.minPrice !== undefined && data.maxPrice !== undefined) {
          return moneyToCents(data.minPrice) <= moneyToCents(data.maxPrice);
        }
        return true;
      },
      {
        message: 'minPrice không được lớn hơn maxPrice',
        path: ['minPrice'],
      },
    )
    .superRefine((arg, ctx) => {
      const data = arg as unknown as RoomsQueryBase;
      const hasAny =
        data.date !== undefined || data.startTime !== undefined || data.endTime !== undefined;

      if (hasAny) {
        if (data.date === undefined || data.startTime === undefined || data.endTime === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'date, startTime và endTime phải được cung cấp cùng nhau',
            path:
              data.date === undefined
                ? ['date']
                : data.startTime === undefined
                  ? ['startTime']
                  : ['endTime'],
          });
          return;
        }

        const { date, startTime, endTime } = data;
        const startIso = `${date}T${padTime(startTime)}.000+07:00`;
        const endIso = `${date}T${padTime(endTime)}.000+07:00`;
        const startDate = new Date(startIso);
        const endDate = new Date(endIso);

        try {
          validateBookingTime(startDate, endDate);
        } catch (err) {
          if (err instanceof AppError) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: err.message,
              path: determineSlotErrorPath(err, startDate, endDate),
            });
          } else {
            throw err;
          }
        }
      }
    });
}

export const getRoomsQuerySchema = refineRoomsQuery(
  z.object(roomsQueryBaseShape),
).transform(toFindRoomsFilter);

export const getAdminRoomsQuerySchema = refineRoomsQuery(
  z.object({
    ...roomsQueryBaseShape,
    status: z.nativeEnum(RoomStatus, { message: 'Trạng thái phòng không hợp lệ' }).optional(),
  }),
).transform(toFindRoomsFilter);

export const getRoomByIdParamsSchema = z
  .object({
    id: z.string().uuid('ID phòng không đúng định dạng UUID'),
  })
  .strict();

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
