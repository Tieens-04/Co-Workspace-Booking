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

export interface AdminAmenityRecord extends AmenityRecord {
  roomCount: number;
}

export interface AmenityWriteData {
  name?: string;
  icon?: string | null;
  description?: string | null;
}

/** Admin catalog operations (CWB-65). Deleting never cascades Room-Amenity links implicitly. */
export class AdminAmenityRepository {
  async findAllWithUsage(): Promise<AdminAmenityRecord[]> {
    const rows = await prisma.amenity.findMany({
      select: { ...amenityPublicSelect, _count: { select: { rooms: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(({ _count, ...amenity }) => ({ ...amenity, roomCount: _count.rooms }));
  }

  async create(data: Required<Pick<AmenityWriteData, 'name'>> & AmenityWriteData) {
    return prisma.amenity.create({ data, select: amenityPublicSelect });
  }

  async update(id: string, data: AmenityWriteData) {
    return prisma.amenity.update({ where: { id }, data, select: amenityPublicSelect });
  }

  /**
   * Deletes only when no room uses the amenity. The FOR UPDATE lock serializes this with a
   * concurrent assignment: inserting into room_amenities takes a shared lock on the amenity row
   * for the foreign-key check, so it waits and then fails instead of being cascaded away.
   */
  async deleteIfUnused(
    id: string,
  ): Promise<{ deleted: boolean; roomCount: number; found: boolean }> {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM amenities WHERE id = ${id} FOR UPDATE`,
      );
      if (locked.length === 0) return { deleted: false, roomCount: 0, found: false };
      const roomCount = await tx.roomAmenity.count({ where: { amenityId: id } });
      if (roomCount > 0) return { deleted: false, roomCount, found: true };
      await tx.amenity.delete({ where: { id } });
      return { deleted: true, roomCount: 0, found: true };
    });
  }
}

export const adminAmenityRepository = new AdminAmenityRepository();
