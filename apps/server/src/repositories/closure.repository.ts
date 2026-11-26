import { Prisma, RoomStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { recordAuditEvent, type AuditActor } from './audit.repository.js';
import {
  enqueueBookingUnavailableEmails,
  requeueClosureUnavailableEmails,
} from './email-outbox.repository.js';
import { BLOCKING_BOOKING_STATUSES } from '../types/booking.type.js';
import { isSlotAligned } from '../utils/booking-time.util.js';
import { AppError } from '../utils/error.util.js';
import {
  CLOSURE_ENDED_MESSAGE,
  CLOSURE_RANGE_ORDER_MESSAGE,
  CLOSURE_SLOT_ALIGNMENT_MESSAGES,
} from '../validators/admin-closure.validator.js';
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

function closureNotFoundError(): AppError {
  return new AppError('CLOSURE_NOT_FOUND', 'Không tìm thấy khung đóng cửa', 404);
}

function closureEndedError(): AppError {
  return new AppError('CLOSURE_ENDED', CLOSURE_ENDED_MESSAGE, 400, [
    { field: 'endTime', message: CLOSURE_ENDED_MESSAGE },
  ]);
}

function assertValidClosureRange(startTime: Date, endTime: Date): void {
  if (endTime.getTime() <= startTime.getTime()) {
    throw new AppError('VALIDATION_ERROR', CLOSURE_RANGE_ORDER_MESSAGE, 400, [
      { field: 'endTime', message: CLOSURE_RANGE_ORDER_MESSAGE },
    ]);
  }

  const slotIssues: Array<{ field: 'startTime' | 'endTime'; message: string }> = [];
  if (!isSlotAligned(startTime)) {
    slotIssues.push({
      field: 'startTime',
      message: CLOSURE_SLOT_ALIGNMENT_MESSAGES.startTime,
    });
  }
  if (!isSlotAligned(endTime)) {
    slotIssues.push({
      field: 'endTime',
      message: CLOSURE_SLOT_ALIGNMENT_MESSAGES.endTime,
    });
  }

  if (slotIssues.length > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      slotIssues.length === 1
        ? slotIssues[0].message
        : 'Thời gian bắt đầu và kết thúc phải đúng mốc 30 phút (ví dụ: 09:00, 09:30) với giây bằng 0',
      400,
      slotIssues,
    );
  }
}

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
      // Include facility-wide closures (roomId: null) alongside room-specific closures; top-level
      // startTime/endTime filters below combine via AND. Do not set where.roomId or overwrite where.OR.
      where.OR = [{ roomId: filter.roomId }, { roomId: null }];
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
        id: true,
        userId: true,
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
      // Pin PRIMARY scan so facility-wide closure locking always acquires locks in
      // PRIMARY (id ASC) -> secondary order even with rooms_status_name_id_idx present,
      // preventing ERROR 1213 cross-deadlocks with PATCH /admin/rooms/:id (lockRoomRow).
      const rooms = await tx.$queryRaw<Array<{ id: string; status: RoomStatus }>>(
        Prisma.sql`SELECT id, status FROM rooms FORCE INDEX (PRIMARY) WHERE status != 'ARCHIVED' ORDER BY id ASC FOR UPDATE`,
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
  ) {
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
    return conflictingBookings;
  }

  async create(data: CreateClosureInput, actor: AuditActor): Promise<ClosureDto> {
    const startDate = new Date(data.startTime);
    const endDate = new Date(data.endTime);
    assertValidClosureRange(startDate, endDate);

    return prisma.$transaction(async (tx) => {
      await this.lockTargetRooms(tx, data.roomId);
      const now = new Date();
      if (endDate.getTime() <= now.getTime()) {
        throw closureEndedError();
      }
      const conflictingBookings = await this.assertNoUnacknowledgedBookings(
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

      if (data.acknowledgeConflictingBookings) {
        const affectedUserBookingIds = conflictingBookings
          .filter(
            (b): b is typeof b & { userId: string } =>
              typeof b.userId === 'string' && b.endTime.getTime() > now.getTime(),
          )
          .map((b) => b.id);
        await enqueueBookingUnavailableEmails(tx, affectedUserBookingIds, `closure:${created.id}`);
      }

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
        throw closureNotFoundError();
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

      const isTimeOrRoomChanged =
        targetRoomId !== existing.roomId ||
        targetStartTime.getTime() !== existing.startTime.getTime() ||
        targetEndTime.getTime() !== existing.endTime.getTime();

      let now: Date | undefined;
      let conflictingBookings: Awaited<ReturnType<typeof this.findConflictingBookings>> = [];
      if (isTimeOrRoomChanged) {
        assertValidClosureRange(targetStartTime, targetEndTime);
        await this.lockTargetRooms(tx, targetRoomId, existing.roomId);
        now = new Date();
        if (targetEndTime.getTime() <= now.getTime()) {
          throw closureEndedError();
        }
        conflictingBookings = await this.assertNoUnacknowledgedBookings(
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
          ...(isTimeOrRoomChanged && data.roomId !== undefined ? { roomId: data.roomId } : {}),
          ...(isTimeOrRoomChanged && data.startTime ? { startTime: targetStartTime } : {}),
          ...(isTimeOrRoomChanged && data.endTime ? { endTime: targetEndTime } : {}),
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

      if (isTimeOrRoomChanged && data.acknowledgeConflictingBookings && now) {
        const activeUserBookings = conflictingBookings.filter(
          (b): b is typeof b & { userId: string } =>
            typeof b.userId === 'string' && b.endTime.getTime() > now.getTime(),
        );
        const affectedUserBookingIds = activeUserBookings.map((b) => b.id);
        const newlyAffectedUserBookingIds = activeUserBookings
          .filter(
            (b) =>
              !(
                (existing.roomId === null || existing.roomId === b.roomId) &&
                existing.startTime.getTime() < b.endTime.getTime() &&
                existing.endTime.getTime() > b.startTime.getTime()
              ),
          )
          .map((b) => b.id);
        const eventKey = `closure:${id}`;
        await enqueueBookingUnavailableEmails(tx, affectedUserBookingIds, eventKey);
        await requeueClosureUnavailableEmails(
          tx,
          eventKey,
          affectedUserBookingIds,
          newlyAffectedUserBookingIds,
          now,
        );
      }

      return toClosureDto(updated);
    });
  }

  async delete(id: string, actor: AuditActor): Promise<ClosureDto> {
    return prisma.$transaction(async (tx) => {
      // Lock the closure row first so concurrent DELETE/PATCH requests serialize cleanly
      // and never read a stale MVCC snapshot or fail with P2025 on duplicate delete.
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM closures WHERE id = ${id} FOR UPDATE`,
      );
      if (!locked || locked.length === 0) {
        throw closureNotFoundError();
      }

      // Defensive belt-and-braces checks per CWB-122 contract even though the X-lock above
      // guarantees the row cannot disappear before this transaction commits.
      const existing = await tx.closure.findUnique({
        where: { id },
        include: closureInclude,
      });
      if (!existing) {
        throw closureNotFoundError();
      }

      const deleted = await tx.closure.deleteMany({
        where: { id },
      });
      if (deleted.count === 0) {
        throw closureNotFoundError();
      }

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
