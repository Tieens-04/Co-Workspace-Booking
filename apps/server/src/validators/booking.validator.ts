import { z } from 'zod';

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
