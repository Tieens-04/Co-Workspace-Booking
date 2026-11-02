import { z } from 'zod';

export const getAmenitiesQuerySchema = z.object({}).strict();

export type GetAmenitiesQueryInput = z.infer<typeof getAmenitiesQuerySchema>;

const iconSchema = z
  .string()
  .trim()
  .max(50)
  .regex(/^[a-z0-9-]*$/, 'Icon chỉ gồm chữ thường, số và dấu gạch ngang')
  .transform((value) => (value ? value : null))
  .nullable();

const descriptionSchema = z
  .string()
  .trim()
  .max(500, 'Mô tả tối đa 500 ký tự')
  .transform((value) => (value ? value : null))
  .nullable();

const nameSchema = z.string().trim().min(1, 'Tên tiện ích không được để trống').max(100);

export const createAmenitySchema = z
  .object({
    name: nameSchema,
    icon: iconSchema.optional(),
    description: descriptionSchema.optional(),
  })
  .strict();

export const updateAmenitySchema = z
  .object({ name: nameSchema, icon: iconSchema, description: descriptionSchema })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  });

export const amenityIdParamsSchema = z
  .object({ id: z.string().uuid('ID tiện ích không đúng định dạng UUID') })
  .strict();

export type CreateAmenityInput = z.infer<typeof createAmenitySchema>;
export type UpdateAmenityInput = z.infer<typeof updateAmenitySchema>;
