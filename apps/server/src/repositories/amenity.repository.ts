import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma.util.js';

export const amenityPublicSelect = {
  id: true,
  name: true,
  icon: true,
  description: true,
} satisfies Prisma.AmenitySelect;

export type AmenityRecord = Prisma.AmenityGetPayload<{
  select: typeof amenityPublicSelect;
}>;

export interface AmenityRepositoryContract {
  findAll(): Promise<AmenityRecord[]>;
}

export class AmenityRepository implements AmenityRepositoryContract {
  async findAll(): Promise<AmenityRecord[]> {
    return prisma.amenity.findMany({
      select: amenityPublicSelect,
      orderBy: {
        name: 'asc',
      },
    });
  }
}

export const amenityRepository = new AmenityRepository();
