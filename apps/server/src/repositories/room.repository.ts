import { Prisma, RoomStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { FindRoomsFilter } from '../types/room.type.js';
import { AppError } from '../utils/error.util.js';

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

export const roomListSelect = {
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

export const roomDetailSelect = {
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

export interface CreateRoomImageInput {
  imageUrl: string;
  isPrimary: boolean;
}

export interface CreateRoomRepoInput {
  name: string;
  description?: string | null;
  capacity: number;
  pricePerHour: string;
  amenityIds?: string[];
  images?: CreateRoomImageInput[];
}

export interface UpdateRoomRepoInput {
  name?: string;
  description?: string | null;
  capacity?: number;
  pricePerHour?: string;
  amenityIds?: string[];
  images?: CreateRoomImageInput[];
}

export interface RoomRepositoryContract {
  findManyAndCount(filter: FindRoomsFilter): Promise<[number, RoomListRecord[]]>;
  findById(id: string): Promise<RoomDetailRecord | null>;
  createWithRelations(data: CreateRoomRepoInput): Promise<RoomDetailRecord>;
  updateWithRelations(id: string, data: UpdateRoomRepoInput): Promise<RoomDetailRecord>;
}

export class RoomRepository implements RoomRepositoryContract {
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

  async createWithRelations(data: CreateRoomRepoInput): Promise<RoomDetailRecord> {
    return prisma.$transaction(async (tx) => {
      if (data.amenityIds && data.amenityIds.length > 0) {
        const existingAmenities = await tx.amenity.findMany({
          where: { id: { in: data.amenityIds } },
          select: { id: true },
        });
        const foundIds = new Set(existingAmenities.map((a) => a.id));
        const missingIds = data.amenityIds.filter((id) => !foundIds.has(id));
        if (missingIds.length > 0) {
          throw new AppError('INVALID_AMENITY_IDS', 'Một hoặc nhiều tiện ích không tồn tại', 400, {
            missingIds,
          });
        }
      }

      const created = await tx.room.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          capacity: data.capacity,
          pricePerHour: new Prisma.Decimal(data.pricePerHour),
          status: RoomStatus.AVAILABLE,
          amenities:
            data.amenityIds && data.amenityIds.length > 0
              ? {
                  create: data.amenityIds.map((amenityId) => ({ amenityId })),
                }
              : undefined,
          images:
            data.images && data.images.length > 0
              ? {
                  create: data.images.map((img) => ({
                    imageUrl: img.imageUrl,
                    isPrimary: img.isPrimary,
                    publicId: null,
                  })),
                }
              : undefined,
        },
        select: roomDetailSelect,
      });

      return created;
    });
  }

  async updateWithRelations(id: string, data: UpdateRoomRepoInput): Promise<RoomDetailRecord> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.room.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        throw new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404);
      }

      if (data.amenityIds && data.amenityIds.length > 0) {
        const existingAmenities = await tx.amenity.findMany({
          where: { id: { in: data.amenityIds } },
          select: { id: true },
        });
        const foundIds = new Set(existingAmenities.map((a) => a.id));
        const missingIds = data.amenityIds.filter((aid) => !foundIds.has(aid));
        if (missingIds.length > 0) {
          throw new AppError('INVALID_AMENITY_IDS', 'Một hoặc nhiều tiện ích không tồn tại', 400, {
            missingIds,
          });
        }
      }

      const scalarUpdate: Prisma.RoomUpdateInput = {};
      if (data.name !== undefined) scalarUpdate.name = data.name;
      if (data.description !== undefined) scalarUpdate.description = data.description;
      if (data.capacity !== undefined) scalarUpdate.capacity = data.capacity;
      if (data.pricePerHour !== undefined) {
        scalarUpdate.pricePerHour = new Prisma.Decimal(data.pricePerHour);
      }

      if (Object.keys(scalarUpdate).length > 0) {
        await tx.room.update({
          where: { id },
          data: scalarUpdate,
        });
      }

      if (data.amenityIds !== undefined) {
        await tx.roomAmenity.deleteMany({
          where: { roomId: id },
        });
        if (data.amenityIds.length > 0) {
          await tx.roomAmenity.createMany({
            data: data.amenityIds.map((amenityId) => ({
              roomId: id,
              amenityId,
            })),
          });
        }
      }

      if (data.images !== undefined) {
        await tx.roomImage.deleteMany({
          where: { roomId: id },
        });
        if (data.images.length > 0) {
          await tx.roomImage.createMany({
            data: data.images.map((img) => ({
              roomId: id,
              imageUrl: img.imageUrl,
              isPrimary: img.isPrimary,
              publicId: null,
            })),
          });
        }
      }

      const updated = await tx.room.findUnique({
        where: { id },
        select: roomDetailSelect,
      });

      return updated!;
    });
  }
}

export const roomRepository = new RoomRepository();
