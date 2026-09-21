import { Prisma, RoomStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { FindRoomsFilter } from '../types/room.type.js';
import { AppError } from '../utils/error.util.js';
import { BLOCKING_BOOKING_STATUSES } from '../types/booking.type.js';

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
  status?: RoomStatus;
  acknowledgeFutureBookings?: boolean;
}

export interface LockedRoomRecord {
  id: string;
  name: string;
  status: RoomStatus;
  pricePerHour: Prisma.Decimal;
}

export async function lockRoomRow(
  tx: Prisma.TransactionClient,
  roomId: string,
): Promise<LockedRoomRecord> {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      name: string;
      status: RoomStatus;
      price_per_hour: Prisma.Decimal | string | number;
    }>
  >(Prisma.sql`SELECT id, name, status, price_per_hour FROM rooms WHERE id = ${roomId} FOR UPDATE`);

  if (!rows || rows.length === 0) {
    throw new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404);
  }

  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    pricePerHour: new Prisma.Decimal(row.price_per_hour),
  };
}

export interface AppendRoomImageItem {
  imageUrl: string;
  publicId: string;
}

export interface UpdateRoomRepoResult {
  record: RoomDetailRecord;
  removedPublicIds: string[];
}

export interface RoomAvailabilityRecord {
  id: string;
  status: RoomStatus;
  bookings: Array<{
    startTime: Date;
    endTime: Date;
  }>;
}

export interface RoomRepositoryContract {
  findManyAndCount(filter: FindRoomsFilter): Promise<[number, RoomListRecord[]]>;
  findById(id: string): Promise<RoomDetailRecord | null>;
  createWithRelations(data: CreateRoomRepoInput): Promise<RoomDetailRecord>;
  updateWithRelations(id: string, data: UpdateRoomRepoInput): Promise<UpdateRoomRepoResult>;
  appendImages(id: string, images: AppendRoomImageItem[]): Promise<RoomDetailRecord>;
  findAvailabilityById(
    id: string,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<RoomAvailabilityRecord | null>;
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

  async findAvailabilityById(
    id: string,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<RoomAvailabilityRecord | null> {
    return prisma.room.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        bookings: {
          where: {
            status: { in: [...BLOCKING_BOOKING_STATUSES] },
            startTime: { lt: dayEnd },
            endTime: { gt: dayStart },
          },
          select: {
            startTime: true,
            endTime: true,
          },
        },
      },
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

  async updateWithRelations(id: string, data: UpdateRoomRepoInput): Promise<UpdateRoomRepoResult> {
    return prisma.$transaction(async (tx) => {
      // Lock room row in MySQL with FOR UPDATE to serialize with appendImages and other concurrent room updates
      const lockedRoom = await lockRoomRow(tx, id);

      // Check transition to MAINTENANCE with future confirmed bookings
      const isTransitionToMaintenance =
        data.status === RoomStatus.MAINTENANCE && lockedRoom.status !== RoomStatus.MAINTENANCE;

      if (isTransitionToMaintenance) {
        const capturedNow = new Date();
        const futureBookings = await tx.booking.findMany({
          where: {
            roomId: id,
            status: { in: [...BLOCKING_BOOKING_STATUSES] },
            startTime: { gt: capturedNow },
          },
          orderBy: { startTime: 'asc' },
          select: {
            bookingCode: true,
            startTime: true,
            endTime: true,
          },
        });

        if (futureBookings.length > 0 && !data.acknowledgeFutureBookings) {
          throw new AppError(
            'ROOM_HAS_FUTURE_BOOKINGS',
            'Phòng có booking sắp tới; các booking phải được xử lý thủ công',
            409,
            {
              futureBookingCount: futureBookings.length,
              bookings: futureBookings.map((b) => ({
                bookingCode: b.bookingCode,
                startTime: b.startTime.toISOString(),
                endTime: b.endTime.toISOString(),
              })),
            },
          );
        }
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
      if (data.status !== undefined) {
        scalarUpdate.status = data.status;
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

      let removedPublicIds: string[] = [];
      if (data.images !== undefined) {
        const existingImages = await tx.roomImage.findMany({
          where: { roomId: id },
          select: { id: true, imageUrl: true, publicId: true, isPrimary: true },
        });

        const newImages = data.images;
        const newUrlSet = new Set(newImages.map((img) => img.imageUrl));

        // 1. Delete images that are no longer in newImages
        const toDelete = existingImages.filter((img) => !newUrlSet.has(img.imageUrl));
        removedPublicIds = toDelete
          .map((img) => img.publicId)
          .filter((pid): pid is string => Boolean(pid));

        if (toDelete.length > 0) {
          await tx.roomImage.deleteMany({
            where: { id: { in: toDelete.map((img) => img.id) } },
          });
        }

        // 2. For retained images, update isPrimary if it changed
        for (const existingImg of existingImages) {
          if (newUrlSet.has(existingImg.imageUrl)) {
            const target = newImages.find((img) => img.imageUrl === existingImg.imageUrl)!;
            if (existingImg.isPrimary !== target.isPrimary) {
              await tx.roomImage.update({
                where: { id: existingImg.id },
                data: { isPrimary: target.isPrimary },
              });
            }
          }
        }

        // 3. For newly added images (URL not in existingImages), insert with publicId: null
        const existingUrlSet = new Set(existingImages.map((img) => img.imageUrl));
        const toInsert = newImages.filter((img) => !existingUrlSet.has(img.imageUrl));
        if (toInsert.length > 0) {
          await tx.roomImage.createMany({
            data: toInsert.map((img) => ({
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

      return {
        record: updated!,
        removedPublicIds,
      };
    });
  }

  async appendImages(id: string, images: AppendRoomImageItem[]): Promise<RoomDetailRecord> {
    if (!images || images.length === 0) {
      const existing = await this.findById(id);
      if (!existing) {
        throw new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404);
      }
      return existing;
    }

    return prisma.$transaction(async (tx) => {
      // Lock room row in MySQL with FOR UPDATE
      await lockRoomRow(tx, id);

      // Check if room already has a primary image
      const existingPrimary = await tx.roomImage.findFirst({
        where: { roomId: id, isPrimary: true },
        select: { id: true },
      });
      const hasPrimary = Boolean(existingPrimary);

      // Create new images batch
      await tx.roomImage.createMany({
        data: images.map((img, index) => ({
          roomId: id,
          imageUrl: img.imageUrl,
          publicId: img.publicId,
          isPrimary: !hasPrimary && index === 0,
        })),
      });

      const updated = await tx.room.findUnique({
        where: { id },
        select: roomDetailSelect,
      });

      return updated!;
    });
  }
}

export const roomRepository = new RoomRepository();
