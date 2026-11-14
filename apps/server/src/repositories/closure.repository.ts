import { Prisma, RoomStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { recordAuditEvent, type AuditActor } from './audit.repository.js';
import { BLOCKING_BOOKING_STATUSES } from '../types/booking.type.js';
import { AppError } from '../utils/error.util.js';
import {
  ClosureDto,
  ClosureFilterParams,
  CreateClosureInput,
  UpdateClosureInput,
} from '../types/closure.type.js';

const closureInclude = {
  room: {
    select: {
      id: true,
      name: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} as const;

type PrismaClosureWithRelations = Prisma.ClosureGetPayload<{
  include: typeof closureInclude;
}>;

type LockedClosureRow = {
  id: string;
  room_id: string | null;
  start_time: Date | string;
  end_time: Date | string;
  reason: string;
};

function toClosureDto(record: PrismaClosureWithRelations): ClosureDto {
  return {
    id: record.id,
    roomId: record.roomId,
    room: record.room ? { id: record.room.id, name: record.room.name } : null,
    startTime: record.startTime.toISOString(),
    endTime: record.endTime.toISOString(),
    reason: record.reason,
    createdById: record.createdById,
    createdBy: record.createdBy
      ? {
          id: record.createdBy.id,
          fullName: record.createdBy.fullName,
          email: record.createdBy.email,
        }
      : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class ClosureRepository {
  async findPaginated(filter: ClosureFilterParams): Promise<{
    items: ClosureDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const where: Prisma.ClosureWhereInput = {};

    if (filter.roomId !== undefined) {
      where.roomId = filter.roomId;
    }

    const now = filter.upcoming ? new Date() : undefined;
    if (filter.from && filter.to) {
      where.startTime = { lt: filter.to };
      where.endTime =
        now && now.getTime() > filter.from.getTime() ? { gte: now } : { gt: filter.from };
    } else if (filter.from) {
      where.endTime =
        now && now.getTime() > filter.from.getTime() ? { gte: now } : { gt: filter.from };
    } else if (filter.to) {
      where.startTime = { lt: filter.to };
      if (now) {
        where.endTime = { gte: now };
      }
    } else if (now) {
      where.endTime = { gte: now };
    }

    const [total, records] = await prisma.$transaction([
      prisma.closure.count({ where }),
      prisma.closure.findMany({
        where,
        include: closureInclude,
        orderBy: { startTime: 'asc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
    ]);

    return {
      items: records.map(toClosureDto),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit) || 1,
    };
  }

  async findById(id: string): Promise<ClosureDto | null> {
    const record = await prisma.closure.findUnique({
      where: { id },
      include: closureInclude,
    });
    return record ? toClosureDto(record) : null;
  }

  async findConflictingBookings(
    tx: Prisma.TransactionClient,
    roomId: string | null | undefined,
    startTime: Date,
    endTime: Date,
  ) {
    const where: Prisma.BookingWhereInput = {
      status: { in: [...BLOCKING_BOOKING_STATUSES] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      ...(roomId ? { roomId } : {}),
    };

    return tx.booking.findMany({
      where,
      orderBy: { startTime: 'asc' },
      select: {
        bookingCode: true,
        roomId: true,
        startTime: true,
        endTime: true,
        guestName: true,
        user: { select: { email: true } },
        room: { select: { name: true } },
      },
    });
  }

  private async lockTargetRooms(
    tx: Prisma.TransactionClient,
    targetRoomId: string | null | undefined,
    previousRoomId?: string | null,
  ): Promise<void> {
    if (!targetRoomId || previousRoomId === null) {
      const rooms = await tx.$queryRaw<Array<{ id: string; status: RoomStatus }>>(
        Prisma.sql`SELECT id, status FROM rooms WHERE status != 'ARCHIVED' ORDER BY id ASC FOR UPDATE`,
      );
      if (targetRoomId && !rooms.some((r) => r.id === targetRoomId)) {
        throw new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404);
      }
      return;
    }

    const idsToLock =
      previousRoomId && previousRoomId !== targetRoomId
        ? [previousRoomId, targetRoomId].sort()
        : [targetRoomId];

    for (const roomId of idsToLock) {
      const rows = await tx.$queryRaw<Array<{ id: string; status: RoomStatus }>>(
        Prisma.sql`SELECT id, status FROM rooms WHERE id = ${roomId} FOR UPDATE`,
      );
      if (
        roomId === targetRoomId &&
        (!rows || rows.length === 0 || rows[0].status === RoomStatus.ARCHIVED)
      ) {
        throw new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404);
      }
    }
  }

  private async assertNoUnacknowledgedBookings(
    tx: Prisma.TransactionClient,
    roomId: string | null | undefined,
    startTime: Date,
    endTime: Date,
    acknowledge?: boolean,
  ): Promise<void> {
    const conflictingBookings = await this.findConflictingBookings(tx, roomId, startTime, endTime);
    if (conflictingBookings.length > 0 && !acknowledge) {
      throw new AppError(
        'CLOSURE_HAS_CONFLICTING_BOOKINGS',
        'Khung đóng cửa trùng với các lượt đặt phòng đã xác nhận',
        409,
        {
          conflictingBookingCount: conflictingBookings.length,
          bookings: conflictingBookings.map((b) => ({
            bookingCode: b.bookingCode,
            roomId: b.roomId,
            roomName: b.room.name,
            startTime: b.startTime.toISOString(),
            endTime: b.endTime.toISOString(),
            guestName: b.guestName,
            userEmail: b.user?.email ?? null,
          })),
        },
      );
    }
  }

  async create(data: CreateClosureInput, actor: AuditActor): Promise<ClosureDto> {
    return prisma.$transaction(async (tx) => {
      const startDate = new Date(data.startTime);
      const endDate = new Date(data.endTime);

      await this.lockTargetRooms(tx, data.roomId);
      await this.assertNoUnacknowledgedBookings(
        tx,
        data.roomId,
        startDate,
        endDate,
        data.acknowledgeConflictingBookings,
      );

      const created = await tx.closure.create({
        data: {
          roomId: data.roomId ?? null,
          startTime: startDate,
          endTime: endDate,
          reason: data.reason.trim(),
          createdById: actor.id,
        },
        include: closureInclude,
      });

      await recordAuditEvent(tx, {
        actor,
        action: 'CLOSURE_CREATED',
        entityType: 'CLOSURE',
        entityId: created.id,
        after: {
          roomId: created.roomId,
          startTime: created.startTime.toISOString(),
          endTime: created.endTime.toISOString(),
          reason: created.reason,
          acknowledgeConflictingBookings: Boolean(data.acknowledgeConflictingBookings),
        },
      });

      return toClosureDto(created);
    });
  }

  async update(id: string, data: UpdateClosureInput, actor: AuditActor): Promise<ClosureDto> {
    return prisma.$transaction(async (tx) => {
      // Read all required closure columns inside `FOR UPDATE` so no non-locking SELECT freezes
      // InnoDB's REPEATABLE READ ReadView before `lockTargetRooms` serializes against bookings.
      const lockedRows = await tx.$queryRaw<LockedClosureRow[]>(
        Prisma.sql`SELECT id, room_id, start_time, end_time, reason FROM closures WHERE id = ${id} FOR UPDATE`,
      );
      if (!lockedRows || lockedRows.length === 0) {
        throw new AppError('CLOSURE_NOT_FOUND', 'Không tìm thấy khung đóng cửa', 404);
      }

      const locked = lockedRows[0];
      const existing = {
        id: locked.id,
        roomId: locked.room_id,
        startTime: new Date(locked.start_time),
        endTime: new Date(locked.end_time),
        reason: locked.reason,
      };

      const targetRoomId = data.roomId !== undefined ? data.roomId : existing.roomId;
      const targetStartTime = data.startTime ? new Date(data.startTime) : existing.startTime;
      const targetEndTime = data.endTime ? new Date(data.endTime) : existing.endTime;

      if (targetEndTime.getTime() <= targetStartTime.getTime()) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Thời gian kết thúc phải sau thời gian bắt đầu',
          400,
          [{ field: 'endTime', message: 'Thời gian kết thúc phải sau thời gian bắt đầu' }],
        );
      }

      await this.lockTargetRooms(tx, targetRoomId, existing.roomId);

      const isTimeOrRoomChanged =
        targetRoomId !== existing.roomId ||
        targetStartTime.getTime() !== existing.startTime.getTime() ||
        targetEndTime.getTime() !== existing.endTime.getTime();

      if (isTimeOrRoomChanged) {
        await this.assertNoUnacknowledgedBookings(
          tx,
          targetRoomId,
          targetStartTime,
          targetEndTime,
          data.acknowledgeConflictingBookings,
        );
      }

      const trimmedReason = data.reason !== undefined ? data.reason.trim() : existing.reason;
      const hasAnyChange = isTimeOrRoomChanged || trimmedReason !== existing.reason;

      if (!hasAnyChange) {
        const unchanged = await tx.closure.findUniqueOrThrow({
          where: { id },
          include: closureInclude,
        });
        return toClosureDto(unchanged);
      }

      const updated = await tx.closure.update({
        where: { id },
        data: {
          ...(data.roomId !== undefined ? { roomId: data.roomId } : {}),
          ...(data.startTime ? { startTime: targetStartTime } : {}),
          ...(data.endTime ? { endTime: targetEndTime } : {}),
          ...(data.reason !== undefined ? { reason: trimmedReason } : {}),
        },
        include: closureInclude,
      });

      await recordAuditEvent(tx, {
        actor,
        action: 'CLOSURE_UPDATED',
        entityType: 'CLOSURE',
        entityId: id,
        before: {
          roomId: existing.roomId,
          startTime: existing.startTime.toISOString(),
          endTime: existing.endTime.toISOString(),
          reason: existing.reason,
        },
        after: {
          roomId: updated.roomId,
          startTime: updated.startTime.toISOString(),
          endTime: updated.endTime.toISOString(),
          reason: updated.reason,
          acknowledgeConflictingBookings: Boolean(data.acknowledgeConflictingBookings),
        },
      });

      return toClosureDto(updated);
    });
  }

  async delete(id: string, actor: AuditActor): Promise<ClosureDto> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.closure.findUnique({
        where: { id },
        include: closureInclude,
      });
      if (!existing) {
        throw new AppError('CLOSURE_NOT_FOUND', 'Không tìm thấy khung đóng cửa', 404);
      }

      await tx.closure.delete({
        where: { id },
      });

      await recordAuditEvent(tx, {
        actor,
        action: 'CLOSURE_DELETED',
        entityType: 'CLOSURE',
        entityId: id,
        before: {
          roomId: existing.roomId,
          startTime: existing.startTime.toISOString(),
          endTime: existing.endTime.toISOString(),
          reason: existing.reason,
        },
      });

      return toClosureDto(existing);
    });
  }
}

export const closureRepository = new ClosureRepository();
