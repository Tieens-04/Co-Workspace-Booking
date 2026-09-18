import { z } from 'zod';

export const getAmenitiesQuerySchema = z.object({}).strict();

export type GetAmenitiesQueryInput = z.infer<typeof getAmenitiesQuerySchema>;
