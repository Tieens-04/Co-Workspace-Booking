import { BookingStatus, Prisma, Role } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { AppError } from '../utils/error.util.js';
import { AuditActor, recordAuditEvent } from './audit.repository.js';
import {
  AccountStatus,
  AdminUserDto,
  AffectedBookingDto,
  FindAdminUsersFilter,
  UpdateUserStatusResult,
} from '../types/admin-user.type.js';

// Explicit allowlist: password hash and token version never leave the repository.
const adminUserSelect = {
  id: true,
  email: true,
  fullName: true,
  phoneNumber: true,
  role: true,
  lockedAt: true,
  lockReason: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type AdminUserRecord = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

interface BookingStats {
  bookingCount: number;
  noShowCount: number;
  upcomingBookingCount: number;
  lastBookingAt: Date | null;
}

const emptyStats: BookingStats = {
  bookingCount: 0,
  noShowCount: 0,
  upcomingBookingCount: 0,
  lastBookingAt: null,
};

const toAdminUser = (record: AdminUserRecord, stats: BookingStats = emptyStats): AdminUserDto => ({
  ...record,
  status: record.lockedAt ? 'LOCKED' : 'ACTIVE',
  ...stats,
});

export class AdminUserRepository {
  async findManyAndCount(
    filter: FindAdminUsersFilter,
    now: Date,
  ): Promise<[number, AdminUserDto[]]> {
    const where: Prisma.UserWhereInput = {};
    if (filter.role) where.role = filter.role;
    if (filter.status) where.lockedAt = filter.status === 'LOCKED' ? { not: null } : null;
    if (filter.q) {
      // MySQL's default *_ci collation makes `contains` case-insensitive.
      where.OR = [
        { email: { contains: filter.q } },
        { fullName: { contains: filter.q } },
        { phoneNumber: { contains: filter.q } },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        select: adminUserSelect,
      }),
    ]);

    const stats = await this.bookingStats(
      records.map((r) => r.id),
      now,
    );
    return [total, records.map((r) => toAdminUser(r, stats.get(r.id)))];
  }

  /** Booking counters for one page of accounts (three grouped queries, bounded by page size). */
  private async bookingStats(userIds: string[], now: Date): Promise<Map<string, BookingStats>> {
    const result = new Map<string, BookingStats>();
    if (userIds.length === 0) return result;

    const [all, noShows, upcoming] = await Promise.all([
      prisma.booking.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.booking.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, status: BookingStatus.NO_SHOW },
        _count: { _all: true },
      }),
      prisma.booking.groupBy({
        by: ['userId'],
        where: {
          userId: { in: userIds },
          status: BookingStatus.CONFIRMED,
          startTime: { gte: now },
        },
        _count: { _all: true },
      }),
    ]);

    const entry = (userId: string | null) => {
      const key = userId as string;
      if (!result.has(key)) result.set(key, { ...emptyStats });
      return result.get(key)!;
    };
    for (const row of all) {
      const stats = entry(row.userId);
      stats.bookingCount = row._count._all;
      stats.lastBookingAt = row._max.createdAt;
    }
    for (const row of noShows) entry(row.userId).noShowCount = row._count._all;
    for (const row of upcoming) entry(row.userId).upcomingBookingCount = row._count._all;
    return result;
  }

  /**
   * Locks or unlocks a CUSTOMER account (CWB-79). The row lock serializes this with concurrent
   * status changes and with booking creation (which locks the same row, CWB-78). Locking also
   * bumps the token version so every issued JWT stops working at once (CWB-77). Upcoming
   * bookings are returned for the admin's warning and are deliberately not cancelled.
   */
  async updateStatus(input: {
    userId: string;
    status: AccountStatus;
    reason: string;
    actor: AuditActor;
    now: Date;
  }): Promise<UpdateUserStatusResult> {
    return prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        Array<{ id: string; role: Role; locked_at: Date | null; lock_reason: string | null }>
      >(
        Prisma.sql`SELECT id, role, locked_at, lock_reason FROM users WHERE id = ${input.userId} FOR UPDATE`,
      );
      if (!row) throw new AppError('USER_NOT_FOUND', 'Không tìm thấy tài khoản', 404);
      if (row.role !== Role.CUSTOMER || row.id === input.actor.id) {
        throw new AppError(
          'ADMIN_ACCOUNT_PROTECTED',
          'Chỉ có thể khóa hoặc mở khóa tài khoản khách hàng; không thể thay đổi tài khoản quản trị viên, kể cả tài khoản của bạn',
          403,
        );
      }

      const currentStatus: AccountStatus = row.locked_at ? 'LOCKED' : 'ACTIVE';
      if (currentStatus === input.status) {
        throw new AppError(
          'USER_STATUS_UNCHANGED',
          input.status === 'LOCKED' ? 'Tài khoản đã bị khóa trước đó' : 'Tài khoản đang hoạt động',
          409,
        );
      }

      const locking = input.status === 'LOCKED';
      const updated = await tx.user.update({
        where: { id: input.userId },
        data: locking
          ? { lockedAt: input.now, lockReason: input.reason, tokenVersion: { increment: 1 } }
          : { lockedAt: null, lockReason: null },
        select: adminUserSelect,
      });

      await recordAuditEvent(tx, {
        actor: input.actor,
        action: locking ? 'USER_LOCKED' : 'USER_UNLOCKED',
        entityType: 'USER',
        entityId: input.userId,
        before: { status: currentStatus, lockReason: row.lock_reason },
        after: { status: input.status, reason: input.reason },
      });

      const upcoming = await tx.booking.findMany({
        where: {
          userId: input.userId,
          status: BookingStatus.CONFIRMED,
          startTime: { gte: input.now },
        },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          bookingCode: true,
          startTime: true,
          endTime: true,
          room: { select: { name: true } },
        },
      });
      const affectedBookings: AffectedBookingDto[] = locking
        ? upcoming.map((b) => ({
            id: b.id,
            bookingCode: b.bookingCode,
            roomName: b.room.name,
            startTime: b.startTime,
            endTime: b.endTime,
          }))
        : [];

      const [counts, noShowCount, lastBooking] = await Promise.all([
        tx.booking.count({ where: { userId: input.userId } }),
        tx.booking.count({ where: { userId: input.userId, status: BookingStatus.NO_SHOW } }),
        tx.booking.findFirst({
          where: { userId: input.userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);

      return {
        user: toAdminUser(updated, {
          bookingCount: counts,
          noShowCount,
          upcomingBookingCount: upcoming.length,
          lastBookingAt: lastBooking?.createdAt ?? null,
        }),
        affectedBookings,
      };
    });
  }
}

export const adminUserRepository = new AdminUserRepository();
