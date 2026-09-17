import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { FindRoomsFilter } from '../types/room.type.js';

const amenitySelect = {
  id: true,
  name: true,
  icon: true,
  description: true,
} satisfies Prisma.AmenitySelect;

const imageSelect = {
  id: true,
  imageUrl: true,
  isPrimary: true,
  createdAt: true,
} satisfies Prisma.RoomImageSelect;

const imageOrderBy = [
  { isPrimary: 'desc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.RoomImageOrderByWithRelationInput[];

const roomListSelect = {
  id: true,
  name: true,
  capacity: true,
  pricePerHour: true,
  status: true,
  images: {
    select: imageSelect,
    orderBy: imageOrderBy,
    take: 1,
  },
  amenities: {
    select: {
      amenity: { select: amenitySelect },
    },
  },
} satisfies Prisma.RoomSelect;

const roomDetailSelect = {
  id: true,
  name: true,
  description: true,
  capacity: true,
  pricePerHour: true,
  status: true,
  images: {
    select: imageSelect,
    orderBy: imageOrderBy,
  },
  amenities: {
    select: {
      amenity: { select: amenitySelect },
    },
  },
} satisfies Prisma.RoomSelect;

export type RoomListRecord = Prisma.RoomGetPayload<{
  select: typeof roomListSelect;
}>;

export type RoomDetailRecord = Prisma.RoomGetPayload<{
  select: typeof roomDetailSelect;
}>;

export type SelectedRoomImage = RoomDetailRecord['images'][number];
export type SelectedRoomAmenity = RoomDetailRecord['amenities'][number];

export interface RoomRepositoryContract {
  findManyAndCount(filter: FindRoomsFilter): Promise<[number, RoomListRecord[]]>;
  findById(id: string): Promise<RoomDetailRecord | null>;
}

export class RoomRepository {
  buildWhere(filter: FindRoomsFilter): Prisma.RoomWhereInput {
    const where: Prisma.RoomWhereInput = {};

    if (filter.capacity !== undefined) {
      where.capacity = { gte: filter.capacity };
    }

    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      where.pricePerHour = {
        ...(filter.minPrice !== undefined ? { gte: filter.minPrice } : {}),
        ...(filter.maxPrice !== undefined ? { lte: filter.maxPrice } : {}),
      };
    }

    if (filter.amenityIds && filter.amenityIds.length > 0) {
      where.AND = filter.amenityIds.map((amenityId) => ({
        amenities: {
          some: {
            amenityId,
          },
        },
      }));
    }

    return where;
  }

  async findManyAndCount(filter: FindRoomsFilter): Promise<[number, RoomListRecord[]]> {
    const where = this.buildWhere(filter);
    const skip = (filter.page - 1) * filter.limit;
    const take = filter.limit;

    return Promise.all([
      prisma.room.count({ where }),
      prisma.room.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: roomListSelect,
      }),
    ]);
  }

  async findById(id: string): Promise<RoomDetailRecord | null> {
    return prisma.room.findUnique({
      where: { id },
      select: roomDetailSelect,
    });
  }
}

export const roomRepository = new RoomRepository();
