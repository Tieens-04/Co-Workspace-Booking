import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  RoomStatus,
} from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { escapeMysqlLike } from '../utils/mysql-like.util.js';
import { summarizeRevenueGroups, toRevenueGroups } from '../utils/booking-revenue.util.js';
import { lockRoomRow, type LockedRoomRecord } from './room.repository.js';
import {
  BLOCKING_BOOKING_STATUSES,
  BookingResponseDto,
  BookingRoomUnavailableCause,
  FindUserBookingsFilter,
} from '../types/booking.type.js';
import {
  AdminBookingCustomerDto,
  AdminBookingResponseDto,
  AdminRescheduleBookingRepoInput,
  FindAdminBookingsFilter,
  RevenuePeriodFilter,
  AdminRevenueResponseDto,
  RecordRefundRepoInput,
} from '../types/admin-booking.type.js';
import {
  calculateBookingTotal,
  validateBookingTime,
  validateCustomerCancellationTime,
  validateCustomerRescheduleTime,
} from '../utils/booking-time.util.js';
import { getDayBounds } from '../utils/room-availability.util.js';
import { AppError } from '../utils/error.util.js';
import { AuditAction, AuditActor, recordAuditEvent } from './audit.repository.js';
import { enqueueBookingEmail } from './email-outbox.repository.js';
import { accountDeletedError, accountLockedError } from './user.repository.js';
import { BookingIdempotency, idempotencyKeyReused } from '../utils/idempotency.util.js';
import { ENV } from '../config/env.config.js';

export { accountDeletedError, accountLockedError };

export type BookingUserIdentity = {
  userId: string;
  guestName?: never;
  guestPhone?: never;
};

export type BookingGuestIdentity = {
  userId: null;
  guestName: string;
  guestPhone: string;
};

export type BookingIdentity = BookingUserIdentity | BookingGuestIdentity;

type CustomerLockMode = 'SELF' | 'ADMIN_FOR_CUSTOMER';

export const emailNotVerifiedError = (): AppError =>
  new AppError('EMAIL_NOT_VERIFIED', 'Vui lòng xác thực email trước khi đặt phòng', 403);

const customerNotFoundError = (): AppError =>
  new AppError('CUSTOMER_NOT_FOUND', 'Không tìm thấy tài khoản khách hàng', 404);

const invalidCustomerRoleError = (): AppError =>
  new AppError(
    'INVALID_CUSTOMER_ROLE',
    'Chỉ có thể đặt phòng hộ cho tài khoản có vai trò CUSTOMER',
    400,
  );

/**
 * CWB-78, CWB-87, CWB-88, CWB-112, CWB-99: locks the customer's `users` row first (before
 * rooms/bookings) and enforces lifecycle guards inside the booking transaction.
 */
async function lockBookableCustomer(
  tx: Prisma.TransactionClient,
  userId: string,
  mode: CustomerLockMode = 'SELF',
): Promise<void> {
  const [account] = await tx.$queryRaw<
    Array<{
      role?: Role;
      locked_at: Date | null;
      email_verified_at: Date | null;
      deleted_at: Date | null;
    }>
  >(
    Prisma.sql`SELECT role, locked_at, email_verified_at, deleted_at FROM users WHERE id = ${userId} FOR UPDATE`,
  );
  if (!account || account.deleted_at) {
    throw mode === 'ADMIN_FOR_CUSTOMER' ? customerNotFoundError() : accountDeletedError();
  }
  if (mode === 'ADMIN_FOR_CUSTOMER' && account.role !== Role.CUSTOMER) {
    throw invalidCustomerRoleError();
  }
  if (account.locked_at) throw accountLockedError();
  if (!account.email_verified_at) throw emailNotVerifiedError();
}

export const activeBookingLimitError = (limit: number): AppError =>
  new AppError(
    'ACTIVE_BOOKING_LIMIT',
    `Bạn đã đạt giới hạn ${limit} lượt đặt phòng sắp tới. Vui lòng sử dụng hoặc hủy bớt một lượt trước khi đặt thêm.`,
    409,
    { limit },
  );

/**
 * CWB-78: a customer may hold at most `limit` not-yet-started CONFIRMED bookings
 * (`startTime >= now`), intentionally excluding already-started ongoing bookings shown in the
 * "Sắp tới" (`UPCOMING`, `endTime > now`) history view (CWB-92). Must run inside the booking
 * transaction after the customer's `users` row is locked, so concurrent requests of the same
 * customer (any room) serialize here.
 */
async function assertActiveBookingCapacity(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  limit: number,
): Promise<void> {
  const active = await tx.booking.count({
    where: { userId, status: BookingStatus.CONFIRMED, startTime: { gte: now } },
  });
  if (active >= limit) throw activeBookingLimitError(limit);
}

/**
 * Limits lazy no-show evaluation to bookings overlapping [from, to) (and a room or user set) — the
 * rows a bounded report or admin listing actually reads. Bookings outside the scope are evaluated
 * when they are read.
 */
export interface NoShowScope {
  from?: Date;
  to?: Date;
  roomId?: string;
  userIds?: string[];
}

export type CreateBookingRepoInput = {
  roomId: string;
  bookingCode: string;
  startDate: Date;
  endDate: Date;
  durationMinutes: number;
  note?: string | null;
  /** Admin who created the booking (walk-in or on behalf of a customer); audited inside the create transaction. */
  auditActor?: AuditActor;
  idempotency?: BookingIdempotency;
} & BookingIdentity;

function assertRoomBookable(lockedRoom: Pick<LockedRoomRecord, 'status'>): void {
  if (lockedRoom.status === 'ARCHIVED') {
    throw new AppError('ROOM_NOT_AVAILABLE', 'Phòng đã ngừng kinh doanh, không thể đặt phòng', 409);
  }
  if (lockedRoom.status === 'MAINTENANCE') {
    throw new AppError(
      'ROOM_NOT_AVAILABLE',
      'Phòng đang trong trạng thái bảo trì, không thể đặt phòng',
      409,
    );
  }
}

async function assertRoomNotClosed(
  tx: Prisma.TransactionClient,
  roomId: string,
  startDate: Date,
  endDate: Date,
): Promise<void> {
  const conflictingClosure = tx.closure
    ? await tx.closure.findFirst({
        where: {
          OR: [{ roomId: null }, { roomId }],
          startTime: { lt: endDate },
          endTime: { gt: startDate },
        },
        select: { id: true, reason: true },
      })
    : null;

  if (conflictingClosure) {
    throw new AppError(
      'ROOM_CLOSED',
      `Phòng hoặc cơ sở đang đóng cửa trong khoảng thời gian này (${conflictingClosure.reason})`,
      409,
      { reason: conflictingClosure.reason },
    );
  }
}

/** Result of createBooking; `idempotentReplay` marks a retried request answered with the original. */
export type CreatedBookingResult = BookingResponseDto & { idempotentReplay?: boolean };

/** Result of rescheduleBooking; `isRescheduled` signals whether schedule fields actually changed. */
export type RescheduledBookingResult = BookingResponseDto & { isRescheduled: boolean };

const createdBookingInclude = { room: { select: { id: true, name: true } } } as const;

export function isBookingOngoing(
  booking: {
    status: BookingStatus;
    startTime: Date;
    endTime: Date;
  },
  now: Date,
): boolean {
  const nowMs = now.getTime();
  return (
    booking.status === BookingStatus.CONFIRMED &&
    booking.startTime.getTime() <= nowMs &&
    nowMs < booking.endTime.getTime()
  );
}

function toBookingResponse(
  booking: Prisma.BookingGetPayload<{ include: typeof createdBookingInclude }>,
): BookingResponseDto {
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    room: { id: booking.room.id, name: booking.room.name },
    startTime: booking.startTime,
    endTime: booking.endTime,
    checkedInAt: booking.checkedInAt,
    attendanceTrackingEnabled: booking.attendanceTrackingEnabled,
    totalAmount: booking.totalAmount.toFixed(2),
    note: booking.note,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    paymentMethod: booking.paymentMethod,
    paidAt: booking.paidAt,
    roomUnavailable: false,
    roomUnavailableReason: null,
    roomUnavailableCause: null,
  };
}

export function assertValidBookingIdentity(data: BookingIdentity): void {
  if (data.userId && (data.guestName || data.guestPhone)) {
    throw new AppError('VALIDATION_ERROR', 'Dữ liệu người đặt phòng không hợp lệ', 400);
  }
  if (!data.userId) {
    if (!data.guestName || !data.guestPhone || !data.guestName.trim() || !data.guestPhone.trim()) {
      throw new AppError('VALIDATION_ERROR', 'Thông tin khách vãng lai không hợp lệ', 400);
    }
  }
}

export interface ClosureOverlapCandidate {
  id: string;
  roomId: string | null;
  startTime: Date;
  endTime: Date;
  reason: string;
}

export interface BookingUnavailabilitySummary {
  roomUnavailable: boolean;
  roomUnavailableReason: string | null;
  roomUnavailableCause: BookingRoomUnavailableCause | null;
}

export function resolveBookingRoomUnavailability(
  booking: {
    status: BookingStatus;
    room: { id: string; status?: RoomStatus };
    startTime: Date;
    endTime: Date;
  },
  closures: readonly ClosureOverlapCandidate[] = [],
  preferredClosureId?: string,
  now: Date = new Date(),
): BookingUnavailabilitySummary {
  if (booking.status !== BookingStatus.CONFIRMED || booking.endTime.getTime() <= now.getTime()) {
    return {
      roomUnavailable: false,
      roomUnavailableReason: null,
      roomUnavailableCause: null,
    };
  }

  const overlapping = closures.filter(
    (closure) =>
      (closure.roomId === null || closure.roomId === booking.room.id) &&
      closure.startTime < booking.endTime &&
      closure.endTime > booking.startTime,
  );

  if (overlapping.length > 0) {
    const matched = preferredClosureId
      ? (overlapping.find((closure) => closure.id === preferredClosureId) ?? overlapping[0])
      : overlapping[0];
    return {
      roomUnavailable: true,
      roomUnavailableReason: matched.reason?.trim() ? matched.reason : 'Khung giờ đóng cửa',
      roomUnavailableCause: 'CLOSURE',
    };
  }

  const roomStatus = booking.room.status ?? RoomStatus.AVAILABLE;
  if (roomStatus === RoomStatus.ARCHIVED) {
    return {
      roomUnavailable: true,
      roomUnavailableReason: 'Phòng đã ngừng kinh doanh',
      roomUnavailableCause: 'ROOM_ARCHIVED',
    };
  }

  if (roomStatus === RoomStatus.MAINTENANCE) {
    return {
      roomUnavailable: true,
      roomUnavailableReason: 'Phòng đang bảo trì',
      roomUnavailableCause: 'ROOM_MAINTENANCE',
    };
  }

  return {
    roomUnavailable: false,
    roomUnavailableReason: null,
    roomUnavailableCause: null,
  };
}

type ClosureFindManyDb = {
  closure?: {
    findMany: Prisma.ClosureDelegate['findMany'];
  };
};

export async function loadOverlappingClosuresForConfirmed(
  db: ClosureFindManyDb,
  records: ReadonlyArray<{
    status: BookingStatus;
    room: { id: string };
    startTime: Date;
    endTime: Date;
  }>,
  now: Date = new Date(),
): Promise<ClosureOverlapCandidate[]> {
  const confirmed = records.filter(
    (record) =>
      record.status === BookingStatus.CONFIRMED && record.endTime.getTime() > now.getTime(),
  );
  if (confirmed.length === 0 || !db.closure?.findMany) {
    return [];
  }

  let minStart = confirmed[0].startTime;
  let maxEnd = confirmed[0].endTime;
  const roomIds = new Set<string>();

  for (const booking of confirmed) {
    roomIds.add(booking.room.id);
    if (booking.startTime < minStart) minStart = booking.startTime;
    if (booking.endTime > maxEnd) maxEnd = booking.endTime;
  }

  return db.closure.findMany({
    where: {
      AND: [
        { OR: [{ roomId: null }, { roomId: { in: Array.from(roomIds) } }] },
        { startTime: { lt: maxEnd } },
        { endTime: { gt: minStart } },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      roomId: true,
      startTime: true,
      endTime: true,
      reason: true,
    },
  });
}

export const bookingReadSelect = {
  id: true,
  bookingCode: true,
  room: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  startTime: true,
  endTime: true,
  checkedInAt: true,
  attendanceTrackingEnabled: true,
  totalAmount: true,
  note: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  paidAt: true,
  cancellationReason: true,
  cancelledAt: true,
  cancelledBy: true,
  refundedAmount: true,
} satisfies Prisma.BookingSelect;

export type BookingReadRecord = Prisma.BookingGetPayload<{
  select: typeof bookingReadSelect;
}>;

const formatAmount = (amt: unknown): string =>
  amt &&
  typeof amt === 'object' &&
  'toFixed' in amt &&
  typeof (amt as { toFixed: (digits: number) => string }).toFixed === 'function'
    ? (amt as { toFixed: (digits: number) => string }).toFixed(2)
    : Number(amt).toFixed(2);

export function mapBookingRecordToDto(
  record: BookingReadRecord,
  closures: readonly ClosureOverlapCandidate[] = [],
  now: Date = new Date(),
): BookingResponseDto {
  const totalAmount = formatAmount(record.totalAmount);
  const unavailability = resolveBookingRoomUnavailability(record, closures, undefined, now);

  return {
    id: record.id,
    bookingCode: record.bookingCode,
    room: {
      id: record.room.id,
      name: record.room.name,
    },
    startTime: record.startTime,
    endTime: record.endTime,
    checkedInAt: record.checkedInAt,
    attendanceTrackingEnabled: record.attendanceTrackingEnabled,
    totalAmount,
    note: record.note,
    status: record.status,
    paymentStatus: record.paymentStatus,
    paymentMethod: record.paymentMethod,
    paidAt: record.paidAt,
    cancellationReason: record.cancellationReason ?? null,
    cancelledAt: record.cancelledAt ?? null,
    cancelledBy: record.cancelledBy ?? null,
    refundedAmount: formatAmount(record.refundedAmount),
    ...unavailability,
    isOngoing: isBookingOngoing(record, now),
  };
}

export const adminBookingReadSelect = {
  id: true,
  bookingCode: true,
  room: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  startTime: true,
  endTime: true,
  checkedInAt: true,
  attendanceTrackingEnabled: true,
  totalAmount: true,
  note: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  cancellationReason: true,
  cancelledAt: true,
  cancelledBy: true,
  refundedAmount: true,
  refunds: {
    select: {
      id: true,
      amount: true,
      method: true,
      reason: true,
      actorId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
  guestName: true,
  guestPhone: true,
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
      phoneNumber: true,
    },
  },
} satisfies Prisma.BookingSelect;

export type AdminBookingReadRecord = Prisma.BookingGetPayload<{
  select: typeof adminBookingReadSelect;
}>;

// Fields captured in booking audit events (CWB-67): lifecycle/payment state only, no PII/secrets.
const auditBookingSelect = {
  bookingCode: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  checkedInAt: true,
  cancellationReason: true,
} satisfies Prisma.BookingSelect;

async function auditBookingChange(
  tx: Prisma.TransactionClient,
  actor: AuditActor | undefined,
  action: AuditAction,
  id: string,
  before: Prisma.BookingGetPayload<{ select: typeof auditBookingSelect }> | null,
  after: AdminBookingReadRecord,
): Promise<void> {
  if (!actor) return;
  await recordAuditEvent(tx, {
    actor,
    action,
    entityType: 'BOOKING',
    entityId: id,
    before,
    after: {
      bookingCode: after.bookingCode,
      status: after.status,
      paymentStatus: after.paymentStatus,
      paymentMethod: after.paymentMethod,
      checkedInAt: after.checkedInAt,
      cancellationReason: after.cancellationReason,
    },
  });
}

export function mapAdminBookingRecordToDto(
  record: AdminBookingReadRecord,
  closures: readonly ClosureOverlapCandidate[] = [],
  now: Date = new Date(),
): AdminBookingResponseDto {
  const totalAmount = formatAmount(record.totalAmount);
  const unavailability = resolveBookingRoomUnavailability(record, closures, undefined, now);

  const customer: AdminBookingCustomerDto = record.user
    ? {
        kind: 'USER',
        name: record.user.fullName,
        phone: record.user.phoneNumber,
        email: record.user.email,
        id: record.user.id,
      }
    : {
        kind: 'GUEST',
        name: record.guestName ?? '',
        phone: record.guestPhone,
      };

  return {
    id: record.id,
    bookingCode: record.bookingCode,
    room: {
      id: record.room.id,
      name: record.room.name,
    },
    startTime: record.startTime,
    endTime: record.endTime,
    checkedInAt: record.checkedInAt,
    attendanceTrackingEnabled: record.attendanceTrackingEnabled,
    totalAmount,
    note: record.note,
    status: record.status,
    paymentStatus: record.paymentStatus,
    paymentMethod: record.paymentMethod,
    cancellationReason: record.cancellationReason ?? null,
    cancelledAt: record.cancelledAt ?? null,
    cancelledBy: record.cancelledBy ?? null,
    refundedAmount: formatAmount(record.refundedAmount),
    refunds: record.refunds
      ? record.refunds.map((r) => ({
          id: r.id,
          amount: formatAmount(r.amount),
          method: r.method,
          reason: r.reason,
          actorId: r.actorId,
          createdAt: r.createdAt,
        }))
      : undefined,
    ...unavailability,
    customer,
  };
}

export interface BookingRepositoryContract {
  createBooking(data: CreateBookingRepoInput): Promise<CreatedBookingResult>;
  findManyAndCountForUser(
    userId: string,
    filter: FindUserBookingsFilter,
    now: Date,
  ): Promise<[number, BookingResponseDto[]]>;
  findByIdForUser(userId: string, id: string, now?: Date): Promise<BookingResponseDto | null>;
  cancelBooking(
    userId: string,
    id: string,
    clock?: (() => Date) | Date,
  ): Promise<BookingResponseDto>;
  rescheduleBooking(
    userId: string,
    id: string,
    input: RescheduleBookingRepoInput,
    clock?: (() => Date) | Date,
  ): Promise<RescheduledBookingResult>;
}

export interface RescheduleBookingRepoInput {
  startTime: string;
  endTime: string;
  roomId?: string;
  note?: string | null;
}

export interface AdminBookingRepositoryContract {
  createAdminCustomerBooking(
    data: CreateBookingRepoInput,
  ): Promise<AdminBookingResponseDto & { idempotentReplay?: boolean }>;
  findManyAndCountForAdmin(
    filter: FindAdminBookingsFilter,
    now?: Date,
  ): Promise<[number, AdminBookingResponseDto[]]>;
  confirmPaymentForAdmin(
    id: string,
    paymentMethod: PaymentMethod,
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto>;
  recordRefundForAdmin(
    id: string,
    input: RecordRefundRepoInput,
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto>;
  cancelBookingForAdmin(
    id: string,
    reason: string,
    actor?: AuditActor,
    clock?: () => Date,
  ): Promise<AdminBookingResponseDto>;
  checkInBookingForAdmin(
    id: string,
    clock?: () => Date,
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto>;
  completeBookingForAdmin(
    id: string,
    clock?: () => Date,
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto>;
  markNoShowForAdmin(
    id: string,
    clock?: () => Date,
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto>;
  rescheduleBookingForAdmin(
    id: string,
    input: AdminRescheduleBookingRepoInput,
    actor?: AuditActor,
    clock?: (() => Date) | Date,
  ): Promise<AdminBookingResponseDto>;
  evaluateNoShowBookings(
    now?: Date,
    userId?: string,
    id?: string,
    scope?: NoShowScope,
  ): Promise<number>;
  calculateRevenue(filter: RevenuePeriodFilter, now?: Date): Promise<AdminRevenueResponseDto>;
}

export class BookingRepository
  implements BookingRepositoryContract, AdminBookingRepositoryContract
{
  private async executeCreateBooking<T>(
    data: CreateBookingRepoInput,
    options: {
      customerLockMode: CustomerLockMode;
      onReplay: (tx: Prisma.TransactionClient, previousId: string, replayNow: Date) => Promise<T>;
      onCreate: (
        tx: Prisma.TransactionClient,
        createData: Prisma.BookingUncheckedCreateInput,
        txNow: Date,
      ) => Promise<{
        id: string;
        result: T;
      }>;
    },
  ): Promise<T> {
    assertValidBookingIdentity(data);
    return prisma.$transaction(async (tx) => {
      // 0. CWB-78, CWB-87, CWB-99: lock the customer's row first (always user -> room, no path
      // locks the reverse) so one customer's concurrent requests for different rooms serialize.
      if (data.userId) {
        await lockBookableCustomer(tx, data.userId, options.customerLockMode);
      }

      // 1. Lock room row in MySQL with FOR UPDATE
      const lockedRoom = await lockRoomRow(tx, data.roomId);

      // 1b. Idempotent retry (CWB-66): checked after the room lock so concurrent duplicates of
      // the same intent serialize, and before time/overlap rules so a retry after a lost response
      // still returns the booking it already created. The locking read sees the latest commit.
      if (data.idempotency) {
        const [previous] = await tx.$queryRaw<
          Array<{ id: string; idempotency_hash: string | null }>
        >(
          Prisma.sql`SELECT id, idempotency_hash FROM bookings
            WHERE idempotency_scope = ${data.idempotency.scope}
              AND idempotency_key = ${data.idempotency.key}
            FOR UPDATE`,
        );
        if (previous) {
          if (previous.idempotency_hash !== data.idempotency.hash) throw idempotencyKeyReused();
          return options.onReplay(tx, previous.id, new Date());
        }
        // CWB-111: pre-transaction time validation was skipped so replays above could succeed;
        // validate new keys now before room/capacity/closure/overlap queries and pricing.
        validateBookingTime(data.startDate, data.endDate, new Date());
      }

      // 2. Reject if room is currently in MAINTENANCE or ARCHIVED
      assertRoomBookable(lockedRoom);

      // 2b. Upcoming-booking cap per customer (CWB-78, CWB-99); admin guest bookings are exempt.
      if (data.userId) {
        await assertActiveBookingCapacity(
          tx,
          data.userId,
          new Date(),
          ENV.BOOKING_MAX_ACTIVE_PER_CUSTOMER,
        );
      }

      // 3. CWB-86: Closure check inside transaction (closure takes precedence over booking overlap)
      await assertRoomNotClosed(tx, data.roomId, data.startDate, data.endDate);

      // 4. Overlap check inside transaction:
      // existing.startTime < requested.endTime AND existing.endTime > requested.startTime
      const conflictingBookings = await tx.booking.findMany({
        where: {
          roomId: data.roomId,
          status: { in: [...BLOCKING_BOOKING_STATUSES] },
          startTime: { lt: data.endDate },
          endTime: { gt: data.startDate },
        },
        take: 1,
        select: { id: true },
      });

      if (conflictingBookings.length > 0) {
        throw new AppError(
          'BOOKING_CONFLICT',
          'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác',
          409,
        );
      }

      // 5. Calculate totalAmount deterministically from persisted room price
      const totalAmount = calculateBookingTotal(lockedRoom.pricePerHour, data.durationMinutes);

      // Lock waits, overlap queries, and code-collision retries can exhaust the lead time.
      const txNow = new Date();
      validateBookingTime(data.startDate, data.endDate, txNow);

      const created = await options.onCreate(
        tx,
        {
          bookingCode: data.bookingCode,
          userId: data.userId ?? null,
          guestName: data.userId ? null : data.guestName,
          guestPhone: data.userId ? null : data.guestPhone,
          roomId: data.roomId,
          startTime: data.startDate,
          endTime: data.endDate,
          totalAmount,
          note: data.note ?? null,
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: null,
          idempotencyScope: data.idempotency?.scope ?? null,
          idempotencyKey: data.idempotency?.key ?? null,
          idempotencyHash: data.idempotency?.hash ?? null,
        },
        txNow,
      );

      if (data.auditActor) {
        // Customer/guest PII stays out of the audit trail; customerId UUID is kept for admin-created user bookings.
        await recordAuditEvent(tx, {
          actor: data.auditActor,
          action: data.userId ? 'BOOKING_CREATED_BY_ADMIN' : 'BOOKING_GUEST_CREATED',
          entityType: 'BOOKING',
          entityId: created.id,
          before: null,
          after: {
            ...(data.userId ? { customerId: data.userId } : {}),
            bookingCode: data.bookingCode,
            roomId: data.roomId,
            startTime: data.startDate,
            endTime: data.endDate,
            totalAmount: totalAmount.toFixed(2),
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.UNPAID,
          },
        });
      }

      if (data.userId) {
        await enqueueBookingEmail(tx, 'BOOKING_CONFIRMATION', created.id);
      }

      return created.result;
    });
  }

  async createBooking(data: CreateBookingRepoInput): Promise<CreatedBookingResult> {
    return this.executeCreateBooking(data, {
      customerLockMode: 'SELF',
      onReplay: async (tx, previousId, replayNow) => {
        const original = await tx.booking.findUniqueOrThrow({
          where: { id: previousId },
          include: { room: { select: { id: true, name: true, status: true } } },
        });
        const closures = await loadOverlappingClosuresForConfirmed(tx, [original], replayNow);
        return {
          ...toBookingResponse(original),
          ...resolveBookingRoomUnavailability(original, closures, undefined, replayNow),
          idempotentReplay: true,
        };
      },
      onCreate: async (tx, createData) => {
        const createdBooking = await tx.booking.create({
          data: createData,
          include: createdBookingInclude,
        });
        return {
          id: createdBooking.id,
          result: toBookingResponse(createdBooking),
        };
      },
    });
  }

  async createAdminCustomerBooking(
    data: CreateBookingRepoInput,
  ): Promise<AdminBookingResponseDto & { idempotentReplay?: boolean }> {
    return this.executeCreateBooking(data, {
      customerLockMode: 'ADMIN_FOR_CUSTOMER',
      onReplay: async (tx, previousId, replayNow) => {
        const original = await tx.booking.findUniqueOrThrow({
          where: { id: previousId },
          select: adminBookingReadSelect,
        });
        const closures = await loadOverlappingClosuresForConfirmed(tx, [original], replayNow);
        return {
          ...mapAdminBookingRecordToDto(original, closures, replayNow),
          idempotentReplay: true,
        };
      },
      onCreate: async (tx, createData, txNow) => {
        const createdBooking = await tx.booking.create({
          data: createData,
          select: adminBookingReadSelect,
        });
        return {
          id: createdBooking.id,
          result: mapAdminBookingRecordToDto(createdBooking, [], txNow),
        };
      },
    });
  }

  async findManyAndCountForUser(
    userId: string,
    filter: FindUserBookingsFilter,
    now: Date,
  ): Promise<[number, BookingResponseDto[]]> {
    await this.evaluateNoShowBookings(now, userId);

    const where: Prisma.BookingWhereInput = {
      userId,
    };

    if (filter.view === 'UPCOMING') {
      where.status = BookingStatus.CONFIRMED;
      where.endTime = { gt: now };
    } else if (filter.view === 'COMPLETED') {
      where.status = { in: [BookingStatus.COMPLETED, BookingStatus.NO_SHOW] };
    } else if (filter.view === 'CANCELLED') {
      where.status = BookingStatus.CANCELLED;
    }

    const orderBy: Prisma.BookingOrderByWithRelationInput[] =
      filter.view === 'UPCOMING'
        ? [{ startTime: 'asc' }, { id: 'asc' }]
        : [{ startTime: 'desc' }, { id: 'desc' }];

    const skip = (filter.page - 1) * filter.limit;
    const take = filter.limit;

    const [total, records] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        skip,
        take,
        orderBy,
        select: bookingReadSelect,
      }),
    ]);

    const closures = await loadOverlappingClosuresForConfirmed(prisma, records, now);
    return [total, records.map((record) => mapBookingRecordToDto(record, closures, now))];
  }

  async findByIdForUser(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<BookingResponseDto | null> {
    await this.evaluateNoShowBookings(now, userId, id);
    const record = await prisma.booking.findFirst({
      where: {
        id,
        userId,
      },
      select: bookingReadSelect,
    });

    if (!record) {
      return null;
    }

    const closures = await loadOverlappingClosuresForConfirmed(prisma, [record], now);
    return mapBookingRecordToDto(record, closures, now);
  }

  async cancelBooking(
    userId: string,
    id: string,
    clock?: (() => Date) | Date,
  ): Promise<BookingResponseDto> {
    return prisma.$transaction(async (tx) => {
      // 1. Lock booking row in MySQL with FOR UPDATE
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: BookingStatus;
          start_time: Date | string;
        }>
      >(
        Prisma.sql`SELECT id, status, start_time FROM bookings WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`,
      );

      if (!rows || rows.length === 0) {
        throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
      }

      const lockedBooking = rows[0];

      // 2. Idempotent check: if already CANCELLED, return current record without modifications
      if (lockedBooking.status === BookingStatus.CANCELLED) {
        const existing = await tx.booking.findUnique({
          where: { id },
          select: bookingReadSelect,
        });
        if (!existing) {
          throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
        }
        const dto = mapBookingRecordToDto(existing);
        dto.isNewlyCancelled = false;
        return dto;
      }

      // 3. Only CONFIRMED bookings can be cancelled by customer
      if (lockedBooking.status !== BookingStatus.CONFIRMED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Chỉ có thể hủy đơn đặt phòng ở trạng thái đã xác nhận',
          409,
        );
      }

      // 4. Policy check: must cancel at least 1 hour (60 minutes) before startTime.
      // Crucial: evaluation time is retrieved AFTER the lock is acquired, eliminating lock-wait skew.
      const evaluationTime = typeof clock === 'function' ? clock() : (clock ?? new Date());
      validateCustomerCancellationTime(new Date(lockedBooking.start_time), evaluationTime);

      // 5. Update status to CANCELLED atomically
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: evaluationTime,
          cancelledBy: Role.CUSTOMER,
        },
        select: bookingReadSelect,
      });

      await enqueueBookingEmail(tx, 'BOOKING_CANCELLATION', id);

      const dto = mapBookingRecordToDto(updated);
      dto.isNewlyCancelled = true;
      return dto;
    });
  }

  async rescheduleBooking(
    userId: string,
    id: string,
    input: RescheduleBookingRepoInput,
    clock?: (() => Date) | Date,
  ): Promise<RescheduledBookingResult> {
    return prisma.$transaction(async (tx) => {
      // 0. CWB-78, CWB-112: lock user row first (user -> booking -> room) and enforce lifecycle guards
      await lockBookableCustomer(tx, userId);

      // 1. Lock booking row in MySQL with FOR UPDATE
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          booking_code: string;
          user_id: string;
          room_id: string;
          status: BookingStatus;
          payment_status: PaymentStatus;
          start_time: Date | string;
          end_time: Date | string;
          total_amount: Prisma.Decimal | string | number;
          note: string | null;
        }>
      >(
        Prisma.sql`SELECT id, booking_code, user_id, room_id, status, payment_status, start_time, end_time, total_amount, note FROM bookings WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`,
      );

      if (!rows || rows.length === 0) {
        throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
      }

      const lockedBooking = rows[0];

      if (lockedBooking.status !== BookingStatus.CONFIRMED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Chỉ có thể đổi lịch đơn đặt phòng ở trạng thái đã xác nhận',
          409,
        );
      }

      if (lockedBooking.payment_status === PaymentStatus.PAID) {
        throw new AppError(
          'PAID_BOOKING_CANNOT_RESCHEDULE',
          'Đơn đặt phòng đã thanh toán không thể tự đổi lịch trực tuyến. Vui lòng liên hệ quầy lễ tân để được hỗ trợ.',
          409,
        );
      }

      // 2. Lock target room (defaults to current room) BEFORE reading evaluationTime so lock wait
      // time cannot mask expired reschedule lead time or 30-minute advance notice.
      const targetRoomId = input.roomId ?? lockedBooking.room_id;
      const lockedRoom = await lockRoomRow(tx, targetRoomId);
      const evaluationTime = typeof clock === 'function' ? clock() : (clock ?? new Date());

      const existingStartDate = new Date(lockedBooking.start_time);
      const existingEndDate = new Date(lockedBooking.end_time);
      validateCustomerRescheduleTime(existingStartDate, evaluationTime);
      assertRoomBookable(lockedRoom);

      // 3. Validate new time slot
      const newStartDate = new Date(input.startTime);
      const newEndDate = new Date(input.endTime);
      validateBookingTime(newStartDate, newEndDate, evaluationTime);

      // 4. CWB-86: Check closure inside transaction (closure takes precedence over booking overlap)
      await assertRoomNotClosed(tx, targetRoomId, newStartDate, newEndDate);

      const isScheduleChanged =
        targetRoomId !== lockedBooking.room_id ||
        newStartDate.getTime() !== existingStartDate.getTime() ||
        newEndDate.getTime() !== existingEndDate.getTime();
      const nextNote = input.note !== undefined ? input.note : lockedBooking.note;
      const isNoteChanged = nextNote !== lockedBooking.note;

      // Intentional defense-in-depth (CWB-120): room bookability, time policy, and closure checks
      // run above even when the submitted slot matches the existing booking so PATCH never returns
      // 200 "Đổi lịch đặt phòng thành công" for a CLOSED slot or MAINTENANCE/ARCHIVED room. Valid
      // no-op / note-only updates skip overlap checks, price recalculation, BOOKING_RESCHEDULED
      // audit logs, BOOKING_REMINDER deletion, and reschedule outbox enqueueing.
      if (!isScheduleChanged) {
        const currentRecord = isNoteChanged
          ? await tx.booking.update({
              where: { id },
              data: { note: nextNote },
              select: bookingReadSelect,
            })
          : await tx.booking.findUniqueOrThrow({
              where: { id },
              select: bookingReadSelect,
            });
        const closures = await loadOverlappingClosuresForConfirmed(
          tx,
          [currentRecord],
          evaluationTime,
        );
        const dto = mapBookingRecordToDto(currentRecord, closures, evaluationTime);
        return { ...dto, isRescheduled: false };
      }

      // 5. Check overlap on target room, strictly excluding this booking
      const conflictingBookings = await tx.booking.findMany({
        where: {
          roomId: targetRoomId,
          id: { not: id },
          status: { in: [...BLOCKING_BOOKING_STATUSES] },
          startTime: { lt: newEndDate },
          endTime: { gt: newStartDate },
        },
        take: 1,
        select: { id: true },
      });

      if (conflictingBookings.length > 0) {
        throw new AppError(
          'BOOKING_CONFLICT',
          'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác',
          409,
        );
      }

      // 6. Calculate new totalAmount deterministically
      const durationMinutes = (newEndDate.getTime() - newStartDate.getTime()) / (60 * 1000);
      const newTotalAmount = calculateBookingTotal(lockedRoom.pricePerHour, durationMinutes);

      // 7. Update booking (bookingCode is preserved)
      const updated = await tx.booking.update({
        where: { id },
        data: {
          roomId: targetRoomId,
          startTime: newStartDate,
          endTime: newEndDate,
          totalAmount: newTotalAmount,
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
        select: bookingReadSelect,
      });

      // 8. Audit log
      await recordAuditEvent(tx, {
        actor: { id: userId, role: Role.CUSTOMER },
        action: 'BOOKING_RESCHEDULED',
        entityType: 'BOOKING',
        entityId: id,
        before: {
          bookingCode: lockedBooking.booking_code,
          roomId: lockedBooking.room_id,
          startTime: existingStartDate.toISOString(),
          endTime: existingEndDate.toISOString(),
          totalAmount: formatAmount(lockedBooking.total_amount),
        },
        after: {
          bookingCode: updated.bookingCode,
          roomId: updated.room.id,
          startTime: updated.startTime.toISOString(),
          endTime: updated.endTime.toISOString(),
          totalAmount: formatAmount(updated.totalAmount),
        },
      });

      // 9. Enqueue outbox email and reset/remove any prior reminder
      await tx.emailOutbox.deleteMany({
        where: { bookingId: id, kind: 'BOOKING_REMINDER' },
      });

      await tx.emailOutbox.upsert({
        where: {
          kind_bookingId_eventKey: {
            kind: 'BOOKING_RESCHEDULED',
            bookingId: id,
            eventKey: '',
          },
        },
        create: {
          kind: 'BOOKING_RESCHEDULED',
          bookingId: id,
          eventKey: '',
          status: 'QUEUED',
          attempts: 0,
          nextAttemptAt: evaluationTime,
          lastError: null,
          sentAt: null,
        },
        update: {
          status: 'QUEUED',
          attempts: 0,
          nextAttemptAt: evaluationTime,
          lastError: null,
          sentAt: null,
        },
      });

      const closures = await loadOverlappingClosuresForConfirmed(tx, [updated], evaluationTime);
      const dto = mapBookingRecordToDto(updated, closures, evaluationTime);
      return { ...dto, isRescheduled: true };
    });
  }

  async rescheduleBookingForAdmin(
    id: string,
    input: AdminRescheduleBookingRepoInput,
    actor?: AuditActor,
    clock?: (() => Date) | Date,
  ): Promise<AdminBookingResponseDto> {
    return prisma.$transaction(async (tx) => {
      // Lock order: bookings -> rooms (matches customer reschedule to avoid customer-vs-admin deadlocks on the same booking);
      // skips lockBookableCustomer so admins can relocate bookings of locked accounts.
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          booking_code: string;
          user_id: string | null;
          room_id: string;
          status: BookingStatus;
          payment_status: PaymentStatus;
          start_time: Date | string;
          end_time: Date | string;
          checked_in_at: Date | string | null;
          total_amount: Prisma.Decimal | string | number;
          note: string | null;
        }>
      >(
        Prisma.sql`SELECT id, booking_code, user_id, room_id, status, payment_status, start_time, end_time, checked_in_at, total_amount, note FROM bookings WHERE id = ${id} FOR UPDATE`,
      );

      if (!rows || rows.length === 0) {
        throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
      }

      const lockedBooking = rows[0];

      if (lockedBooking.status !== BookingStatus.CONFIRMED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Chỉ có thể đổi lịch đơn đặt phòng ở trạng thái đã xác nhận',
          409,
        );
      }

      if (lockedBooking.checked_in_at !== null) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể đổi lịch đơn đặt phòng đã check-in',
          409,
        );
      }

      if (
        lockedBooking.payment_status !== PaymentStatus.UNPAID &&
        lockedBooking.payment_status !== PaymentStatus.PAID
      ) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Trạng thái thanh toán của đơn đặt phòng không hỗ trợ đổi lịch',
          409,
        );
      }

      const targetRoomId = input.roomId ?? lockedBooking.room_id;
      const lockedRoom = await lockRoomRow(tx, targetRoomId);
      const evaluationTime = typeof clock === 'function' ? clock() : (clock ?? new Date());

      const existingStartDate = new Date(lockedBooking.start_time);
      const existingEndDate = new Date(lockedBooking.end_time);
      if (existingEndDate.getTime() <= evaluationTime.getTime()) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể đổi lịch đơn đặt phòng đã kết thúc',
          409,
        );
      }

      const newStartDate = new Date(input.startTime);
      const newEndDate = new Date(input.endTime);

      const isScheduleChanged =
        targetRoomId !== lockedBooking.room_id ||
        newStartDate.getTime() !== existingStartDate.getTime() ||
        newEndDate.getTime() !== existingEndDate.getTime();
      if (!isScheduleChanged) {
        throw new AppError(
          'NO_SCHEDULE_CHANGE',
          'Khung giờ hoặc phòng mới phải khác lịch hiện tại',
          400,
        );
      }

      assertRoomBookable(lockedRoom);
      validateBookingTime(newStartDate, newEndDate, evaluationTime, ENV.BOOKING_MAX_ADVANCE_DAYS, {
        skipAdvanceNotice: true,
      });
      await assertRoomNotClosed(tx, targetRoomId, newStartDate, newEndDate);

      const conflictingBookings = await tx.booking.findMany({
        where: {
          roomId: targetRoomId,
          id: { not: id },
          status: { in: [...BLOCKING_BOOKING_STATUSES] },
          startTime: { lt: newEndDate },
          endTime: { gt: newStartDate },
        },
        take: 1,
        select: { id: true },
      });

      if (conflictingBookings.length > 0) {
        throw new AppError(
          'BOOKING_CONFLICT',
          'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác',
          409,
        );
      }

      const durationMinutes = (newEndDate.getTime() - newStartDate.getTime()) / (60 * 1000);
      const newTotalAmount = calculateBookingTotal(lockedRoom.pricePerHour, durationMinutes);
      const oldTotalAmount = new Prisma.Decimal(lockedBooking.total_amount);
      const priceDelta = newTotalAmount.sub(oldTotalAmount);
      const isPaidWithDelta =
        lockedBooking.payment_status === PaymentStatus.PAID && !priceDelta.isZero();

      if (isPaidWithDelta && !input.acknowledgePriceDelta) {
        throw new AppError(
          'PAID_BOOKING_PRICE_MISMATCH',
          'Tổng tiền mới khác số tiền đã thanh toán. Vui lòng xác nhận đã thu thêm hoặc hoàn chênh lệch tại quầy.',
          409,
          {
            previousTotal: oldTotalAmount.toFixed(2),
            newTotal: newTotalAmount.toFixed(2),
            difference: priceDelta.toFixed(2),
          },
        );
      }

      const updated = await tx.booking.update({
        where: { id },
        data: {
          roomId: targetRoomId,
          startTime: newStartDate,
          endTime: newEndDate,
          totalAmount: newTotalAmount,
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
        select: adminBookingReadSelect,
      });

      if (actor) {
        await recordAuditEvent(tx, {
          actor,
          action: 'BOOKING_RESCHEDULED',
          entityType: 'BOOKING',
          entityId: id,
          before: {
            bookingCode: lockedBooking.booking_code,
            roomId: lockedBooking.room_id,
            startTime: existingStartDate.toISOString(),
            endTime: existingEndDate.toISOString(),
            totalAmount: formatAmount(lockedBooking.total_amount),
            ...(input.note !== undefined ? { note: lockedBooking.note } : {}),
          },
          after: {
            bookingCode: updated.bookingCode,
            roomId: updated.room.id,
            startTime: updated.startTime.toISOString(),
            endTime: updated.endTime.toISOString(),
            totalAmount: formatAmount(updated.totalAmount),
            reason: input.reason,
            ...(input.note !== undefined ? { note: updated.note } : {}),
            ...(isPaidWithDelta
              ? {
                  priceDelta: priceDelta.toFixed(2),
                  acknowledgePriceDelta: true,
                }
              : {}),
          },
        });
      }

      if (lockedBooking.user_id) {
        await tx.emailOutbox.deleteMany({
          where: { bookingId: id, kind: 'BOOKING_REMINDER' },
        });
        await tx.emailOutbox.upsert({
          where: {
            kind_bookingId_eventKey: {
              kind: 'BOOKING_RESCHEDULED',
              bookingId: id,
              eventKey: '',
            },
          },
          create: {
            kind: 'BOOKING_RESCHEDULED',
            bookingId: id,
            eventKey: '',
            status: 'QUEUED',
            attempts: 0,
            nextAttemptAt: evaluationTime,
            lastError: null,
            sentAt: null,
          },
          update: {
            status: 'QUEUED',
            attempts: 0,
            nextAttemptAt: evaluationTime,
            lastError: null,
            sentAt: null,
          },
        });
      }

      const closures = await loadOverlappingClosuresForConfirmed(tx, [updated], evaluationTime);
      return mapAdminBookingRecordToDto(updated, closures, evaluationTime);
    });
  }

  async findManyAndCountForAdmin(
    filter: FindAdminBookingsFilter,
    now: Date = new Date(),
  ): Promise<[number, AdminBookingResponseDto[]]> {
    const orderBy: Prisma.BookingOrderByWithRelationInput[] = [
      { startTime: 'desc' },
      { id: 'desc' },
    ];

    const skip = (filter.page - 1) * filter.limit;
    const take = filter.limit;

    const andConditions: Prisma.BookingWhereInput[] = [];

    if (filter.needsAttention !== undefined) {
      const attentionRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT b.id
        FROM bookings b
        INNER JOIN rooms r ON r.id = b.room_id
        WHERE b.status = ${BookingStatus.CONFIRMED}
          AND b.end_time > ${now}
          AND (
            r.status <> ${RoomStatus.AVAILABLE}
            OR EXISTS (
              SELECT 1
              FROM closures c
              WHERE (c.room_id IS NULL OR c.room_id = b.room_id)
                AND c.start_time < b.end_time
                AND c.end_time > b.start_time
            )
          )
      `);
      const attentionIds = attentionRows.map((row) => row.id);
      if (filter.needsAttention) {
        if (attentionIds.length === 0) {
          return [0, []];
        }
        andConditions.push({ id: { in: attentionIds } });
      } else if (attentionIds.length > 0) {
        andConditions.push({ id: { notIn: attentionIds } });
      }
    }

    if (filter.bookingCode) {
      const escapedCode = escapeMysqlLike(filter.bookingCode);
      andConditions.push({
        bookingCode: filter.bookingCode.startsWith('CS-')
          ? { startsWith: escapedCode }
          : { contains: escapedCode },
      });
    }

    if (filter.roomId) {
      andConditions.push({ roomId: filter.roomId });
    }

    if (filter.status) {
      andConditions.push({ status: filter.status });
    }

    if (filter.paymentStatus) {
      andConditions.push({ paymentStatus: filter.paymentStatus });
    }

    if (filter.needsRefund !== undefined) {
      const refundable: Prisma.BookingWhereInput = {
        status: BookingStatus.CANCELLED,
        paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
      };
      andConditions.push(filter.needsRefund ? refundable : { NOT: refundable });
    }

    if (filter.date) {
      const { dayStart, dayEnd } = getDayBounds(filter.date);
      andConditions.push({
        startTime: {
          gte: dayStart,
          lt: dayEnd,
        },
      });
    } else if (filter.from && filter.to) {
      const { dayStart } = getDayBounds(filter.from);
      const { dayEnd } = getDayBounds(filter.to);
      andConditions.push({
        startTime: {
          gte: dayStart,
          lt: dayEnd,
        },
      });
    }

    if (filter.customer) {
      // CWB-79 / CWB-94: registered customers and walk-in guests; *_ci collation = case-insensitive.
      const q = escapeMysqlLike(filter.customer);
      andConditions.push({
        OR: [
          { user: { email: { contains: q } } },
          { user: { fullName: { contains: q } } },
          { user: { phoneNumber: { contains: q } } },
          { guestName: { contains: q } },
          { guestPhone: { contains: q } },
        ],
      });
    }

    const where: Prisma.BookingWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const [total, records] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        skip,
        take,
        orderBy,
        select: adminBookingReadSelect,
      }),
    ]);

    const closures = await loadOverlappingClosuresForConfirmed(prisma, records, now);
    return [total, records.map((record) => mapAdminBookingRecordToDto(record, closures, now))];
  }

  async recordRefundForAdmin(
    id: string,
    input: RecordRefundRepoInput,
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto> {
    const refundAmount = new Prisma.Decimal(input.amount);
    return prisma.$transaction(async (tx) => {
      // 1. Lock booking row in MySQL with FOR UPDATE
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: BookingStatus;
          payment_status: PaymentStatus;
          total_amount: Prisma.Decimal;
          refunded_amount: Prisma.Decimal;
        }>
      >(
        Prisma.sql`SELECT id, status, payment_status, total_amount, refunded_amount FROM bookings WHERE id = ${id} FOR UPDATE`,
      );

      if (!rows || rows.length === 0) {
        throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt phòng', 404);
      }

      const locked = rows[0];

      // 2. Validate booking state: must be CANCELLED
      if (locked.status !== BookingStatus.CANCELLED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Chỉ có thể hoàn tiền cho đơn đặt phòng đã hủy',
          409,
        );
      }

      // 3. Validate payment status: cannot be UNPAID
      if (locked.payment_status === PaymentStatus.UNPAID) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể hoàn tiền cho đơn đặt phòng chưa thanh toán',
          409,
        );
      }

      const totalAmount = new Prisma.Decimal(locked.total_amount);
      const currentRefunded = new Prisma.Decimal(locked.refunded_amount);
      const remainingRefundable = totalAmount.sub(currentRefunded);

      // 4. Validate refundable capacity
      if (refundAmount.lte(0)) {
        throw new AppError('REFUND_AMOUNT_INVALID', 'Số tiền hoàn phải lớn hơn 0', 400);
      }

      if (remainingRefundable.lte(0)) {
        throw new AppError(
          'BOOKING_ALREADY_FULLY_REFUNDED',
          'Đơn đặt phòng đã được hoàn đủ tiền',
          409,
        );
      }

      if (refundAmount.gt(remainingRefundable)) {
        throw new AppError(
          'REFUND_AMOUNT_EXCEEDED',
          'Số tiền hoàn vượt quá số tiền còn lại có thể hoàn',
          400,
        );
      }

      const newRefundedAmount = currentRefunded.add(refundAmount);
      const isFullyRefunded = newRefundedAmount.equals(totalAmount);
      const newPaymentStatus = isFullyRefunded
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;

      // 5. Create Refund record
      await tx.refund.create({
        data: {
          bookingId: id,
          amount: refundAmount,
          method: input.method,
          reason: input.reason,
          actorId: actor?.id ?? 'system',
        },
      });

      // 6. Update Booking
      const updated = await tx.booking.update({
        where: { id },
        data: {
          refundedAmount: newRefundedAmount,
          paymentStatus: newPaymentStatus,
        },
        select: adminBookingReadSelect,
      });

      // 7. Audit log
      if (actor) {
        await recordAuditEvent(tx, {
          actor,
          action: 'BOOKING_REFUNDED',
          entityType: 'BOOKING',
          entityId: id,
          before: {
            paymentStatus: locked.payment_status,
            refundedAmount: formatAmount(currentRefunded),
          },
          after: {
            paymentStatus: newPaymentStatus,
            refundedAmount: formatAmount(newRefundedAmount),
            refundAmount: formatAmount(refundAmount),
            method: input.method,
            reason: input.reason,
          },
        });
      }

      return mapAdminBookingRecordToDto(updated);
    });
  }

  async confirmPaymentForAdmin(
    id: string,
    paymentMethod: PaymentMethod,
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto> {
    return prisma.$transaction(async (tx) => {
      // 1. Lock booking row in MySQL with FOR UPDATE
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: BookingStatus;
          payment_status: PaymentStatus;
          payment_method: PaymentMethod | null;
          user_id: string | null;
        }>
      >(
        Prisma.sql`SELECT id, status, payment_status, payment_method, user_id FROM bookings WHERE id = ${id} FOR UPDATE`,
      );

      if (!rows || rows.length === 0) {
        throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
      }

      const lockedBooking = rows[0];

      // 2. Reject if booking is already CANCELLED
      if (lockedBooking.status === BookingStatus.CANCELLED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể xác nhận thanh toán cho đơn đặt phòng đã hủy',
          409,
        );
      }

      // 3. Idempotent check: if already PAID, return current record without modification
      if (lockedBooking.payment_status === PaymentStatus.PAID) {
        const existing = await tx.booking.findUnique({
          where: { id },
          select: adminBookingReadSelect,
        });
        if (!existing) {
          throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
        }
        const closures = await loadOverlappingClosuresForConfirmed(tx, [existing]);
        return mapAdminBookingRecordToDto(existing, closures);
      }

      // 4. Update payment status to PAID with the specified payment method
      const auditBefore = actor
        ? await tx.booking.findUnique({ where: { id }, select: auditBookingSelect })
        : null;
      const updated = await tx.booking.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod,
          paidAt: new Date(),
        },
        select: adminBookingReadSelect,
      });
      await auditBookingChange(tx, actor, 'BOOKING_PAYMENT_CONFIRMED', id, auditBefore, updated);
      // CWB-89: receipt email for registered customers (guests have no email), committed with the
      // payment; SMTP failures only retry the email and never touch the payment.
      if (lockedBooking.user_id) {
        await enqueueBookingEmail(tx, 'PAYMENT_RECEIPT', id);
      }

      const closures = await loadOverlappingClosuresForConfirmed(tx, [updated]);
      return mapAdminBookingRecordToDto(updated, closures);
    });
  }

  async cancelBookingForAdmin(
    id: string,
    reason: string,
    actor?: AuditActor,
    clock: () => Date = () => new Date(),
  ): Promise<AdminBookingResponseDto> {
    return prisma.$transaction(async (tx) => {
      // 1. Lock booking row in MySQL with FOR UPDATE
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: BookingStatus;
          end_time: Date | string;
          checked_in_at: Date | string | null;
          attendance_tracking_enabled: boolean | number;
        }>
      >(
        Prisma.sql`SELECT id, status, end_time, checked_in_at, attendance_tracking_enabled FROM bookings WHERE id = ${id} FOR UPDATE`,
      );

      if (!rows || rows.length === 0) {
        throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
      }

      const lockedBooking = rows[0];

      // 2. Idempotent check: if already CANCELLED, return current record without modification
      if (lockedBooking.status === BookingStatus.CANCELLED) {
        const existing = await tx.booking.findUnique({
          where: { id },
          select: adminBookingReadSelect,
        });
        if (!existing) {
          throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
        }
        const dto = mapAdminBookingRecordToDto(existing);
        dto.isNewlyCancelled = false;
        return dto;
      }

      // 3. Only CONFIRMED bookings can be cancelled (CWB-71): COMPLETED and NO_SHOW are historical
      //    outcomes that reports rely on and must never be overwritten.
      if (lockedBooking.status === BookingStatus.COMPLETED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể hủy đơn đặt phòng đã hoàn tất',
          409,
        );
      }
      if (lockedBooking.status !== BookingStatus.CONFIRMED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể hủy đơn đặt phòng đã đánh dấu không đến',
          409,
        );
      }

      // 4. An ended, unattended booking is already a NO_SHOW that lazy evaluation has not persisted
      //    yet. Evaluated after acquiring the lock so the outcome does not depend on whether a read
      //    happened to persist NO_SHOW first.
      const isLazyNoShow =
        Boolean(lockedBooking.attendance_tracking_enabled) &&
        !lockedBooking.checked_in_at &&
        new Date(lockedBooking.end_time).getTime() <= clock().getTime();
      if (isLazyNoShow) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể hủy đơn đặt phòng đã đánh dấu không đến',
          409,
        );
      }

      // 5. Update status to CANCELLED with cancellation reason
      const auditBefore = actor
        ? await tx.booking.findUnique({ where: { id }, select: auditBookingSelect })
        : null;
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancellationReason: reason,
          cancelledAt: clock(),
          cancelledBy: Role.ADMIN,
        },
        select: adminBookingReadSelect,
      });
      await auditBookingChange(tx, actor, 'BOOKING_CANCELLED_BY_ADMIN', id, auditBefore, updated);

      const dto = mapAdminBookingRecordToDto(updated);
      // Walk-in guests have no email address; only registered customers are notified.
      if (dto.customer.kind === 'USER') {
        await enqueueBookingEmail(tx, 'BOOKING_CANCELLATION', id);
      }
      dto.isNewlyCancelled = true;
      return dto;
    });
  }

  async checkInBookingForAdmin(
    id: string,
    clock: () => Date = () => new Date(),
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto> {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: BookingStatus;
          start_time: Date | string;
          end_time: Date | string;
          checked_in_at: Date | string | null;
        }>
      >(
        Prisma.sql`SELECT id, status, start_time, end_time, checked_in_at FROM bookings WHERE id = ${id} FOR UPDATE`,
      );
      const booking = rows[0];
      if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
      const now = clock();
      if (
        booking.checked_in_at &&
        (booking.status === BookingStatus.CONFIRMED || booking.status === BookingStatus.COMPLETED)
      ) {
        const existing = await tx.booking.findUnique({
          where: { id },
          select: adminBookingReadSelect,
        });
        if (!existing) throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
        const closures = await loadOverlappingClosuresForConfirmed(tx, [existing], now);
        return mapAdminBookingRecordToDto(existing, closures, now);
      }
      if (
        booking.status !== BookingStatus.CONFIRMED ||
        now.getTime() < new Date(booking.start_time).getTime() ||
        now.getTime() >= new Date(booking.end_time).getTime()
      ) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Chỉ có thể check-in đơn đã xác nhận trong thời gian đặt phòng',
          409,
        );
      }
      const auditBefore = actor
        ? await tx.booking.findUnique({ where: { id }, select: auditBookingSelect })
        : null;
      const updated = await tx.booking.update({
        where: { id },
        data: { checkedInAt: now },
        select: adminBookingReadSelect,
      });
      await auditBookingChange(tx, actor, 'BOOKING_CHECKED_IN', id, auditBefore, updated);
      const closures = await loadOverlappingClosuresForConfirmed(tx, [updated], now);
      return mapAdminBookingRecordToDto(updated, closures, now);
    });
  }

  async completeBookingForAdmin(
    id: string,
    clock: () => Date = () => new Date(),
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto> {
    return prisma.$transaction(async (tx) => {
      // 1. Lock booking row in MySQL with FOR UPDATE
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: BookingStatus;
          end_time: Date | string;
          checked_in_at: Date | string | null;
          attendance_tracking_enabled: boolean;
        }>
      >(
        Prisma.sql`SELECT id, status, end_time, checked_in_at, attendance_tracking_enabled FROM bookings WHERE id = ${id} FOR UPDATE`,
      );

      if (!rows || rows.length === 0) {
        throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
      }

      const lockedBooking = rows[0];

      // 2. Idempotent check: if already COMPLETED, return current record without modification
      if (lockedBooking.status === BookingStatus.COMPLETED) {
        const existing = await tx.booking.findUnique({
          where: { id },
          select: adminBookingReadSelect,
        });
        if (!existing) {
          throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
        }
        return mapAdminBookingRecordToDto(existing);
      }

      // 3. Reject if booking is CANCELLED
      if (lockedBooking.status === BookingStatus.CANCELLED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể hoàn tất đơn đặt phòng đã hủy',
          409,
        );
      }

      // 4. Reject if booking is NO_SHOW
      if (lockedBooking.status === BookingStatus.NO_SHOW) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể hoàn tất đơn đặt phòng đã đánh dấu không đến',
          409,
        );
      }

      // Evaluate only after acquiring the lock, including time spent waiting for it.
      if (clock().getTime() < new Date(lockedBooking.end_time).getTime()) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Chỉ có thể hoàn tất đơn đặt phòng khi đã đến giờ kết thúc',
          409,
        );
      }

      if (lockedBooking.attendance_tracking_enabled && !lockedBooking.checked_in_at) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Chỉ có thể hoàn tất đơn đặt phòng đã check-in',
          409,
        );
      }

      // 5. Update status to COMPLETED
      const auditBefore = actor
        ? await tx.booking.findUnique({ where: { id }, select: auditBookingSelect })
        : null;
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.COMPLETED,
        },
        select: adminBookingReadSelect,
      });
      await auditBookingChange(tx, actor, 'BOOKING_COMPLETED', id, auditBefore, updated);

      return mapAdminBookingRecordToDto(updated);
    });
  }

  async markNoShowForAdmin(
    id: string,
    clock: () => Date = () => new Date(),
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto> {
    return prisma.$transaction(async (tx) => {
      // 1. Lock booking row in MySQL with FOR UPDATE
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: BookingStatus;
          end_time: Date | string;
          checked_in_at: Date | string | null;
          attendance_tracking_enabled: boolean;
        }>
      >(
        Prisma.sql`SELECT id, status, end_time, checked_in_at, attendance_tracking_enabled FROM bookings WHERE id = ${id} FOR UPDATE`,
      );

      if (!rows || rows.length === 0) {
        throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
      }

      const lockedBooking = rows[0];

      if (lockedBooking.checked_in_at) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể đánh dấu không đến cho đơn đã check-in',
          409,
        );
      }

      // 2. Idempotent check: if already NO_SHOW, return current record without modification
      if (lockedBooking.status === BookingStatus.NO_SHOW) {
        const existing = await tx.booking.findUnique({
          where: { id },
          select: adminBookingReadSelect,
        });
        if (!existing) {
          throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
        }
        return mapAdminBookingRecordToDto(existing);
      }

      // 3. Reject if booking is CANCELLED
      if (lockedBooking.status === BookingStatus.CANCELLED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể đánh dấu không đến cho đơn đặt phòng đã hủy',
          409,
        );
      }

      // 4. Reject if booking is COMPLETED
      if (lockedBooking.status === BookingStatus.COMPLETED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể đánh dấu không đến cho đơn đặt phòng đã hoàn tất',
          409,
        );
      }

      if (clock().getTime() < new Date(lockedBooking.end_time).getTime()) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Chỉ có thể đánh dấu không đến khi đã đến giờ kết thúc đặt phòng',
          409,
        );
      }

      // 5. Update status to NO_SHOW
      const auditBefore = actor
        ? await tx.booking.findUnique({ where: { id }, select: auditBookingSelect })
        : null;
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.NO_SHOW,
        },
        select: adminBookingReadSelect,
      });
      await auditBookingChange(tx, actor, 'BOOKING_MARKED_NO_SHOW', id, auditBefore, updated);

      return mapAdminBookingRecordToDto(updated);
    });
  }

  async evaluateNoShowBookings(
    now?: Date,
    userId?: string,
    id?: string,
    scope?: NoShowScope,
  ): Promise<number> {
    if (scope?.userIds && scope.userIds.length === 0) return 0;
    if (userId && scope?.userIds && !scope.userIds.includes(userId)) return 0;
    const where: Prisma.BookingWhereInput = {
      status: BookingStatus.CONFIRMED,
      checkedInAt: null,
      attendanceTrackingEnabled: true,
      // CWB-57: a scoped read only evaluates bookings overlapping the window it returns.
      endTime: { lte: now ?? new Date(), ...(scope?.from ? { gt: scope.from } : {}) },
      ...(scope?.to ? { startTime: { lt: scope.to } } : {}),
      ...(scope?.roomId ? { roomId: scope.roomId } : {}),
      ...(userId ? { userId } : scope?.userIds ? { userId: { in: scope.userIds } } : {}),
      ...(id ? { id } : {}),
    };
    let count = 0;
    let cursor: string | undefined;
    const batchSize = 100;
    for (;;) {
      const candidates = await prisma.booking.findMany({
        where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: batchSize,
      });
      if (candidates.length === 0) break;
      const ids = candidates.map((booking) => booking.id);
      count += await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM bookings WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
        );
        // Recheck attendance and lifecycle after acquiring all booking locks.
        const result = await tx.booking.updateMany({
          where: { ...where, id: { in: ids }, endTime: { lte: now ?? new Date() } },
          data: { status: BookingStatus.NO_SHOW },
        });
        return result.count;
      });
      cursor = ids[ids.length - 1];
      if (id || candidates.length < batchSize) break;
    }
    return count;
  }

  async calculateRevenue(
    filter: RevenuePeriodFilter,
    now: Date = new Date(),
  ): Promise<AdminRevenueResponseDto> {
    const where: Prisma.BookingWhereInput = {};
    if (filter.roomId) {
      where.roomId = filter.roomId;
    }
    if (filter.startDate || filter.endDate) {
      where.startTime = {};
      if (filter.startDate) {
        const { dayStart } = getDayBounds(filter.startDate);
        where.startTime.gte = dayStart;
      }
      if (filter.endDate) {
        const { dayEnd } = getDayBounds(filter.endDate);
        where.startTime.lt = dayEnd;
      }
    }

    const startRange = where.startTime as Prisma.DateTimeFilter | undefined;
    await this.evaluateNoShowBookings(now, undefined, undefined, {
      from: startRange?.gte as Date | undefined,
      to: startRange?.lt as Date | undefined,
      roomId: filter.roomId,
    });

    // Aggregate in MySQL: at most 8 (status x payment) rows reach Node regardless of volume.
    const groupRows = await prisma.booking.groupBy({
      by: ['status', 'paymentStatus'],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true, refundedAmount: true },
    });
    const groups = toRevenueGroups(groupRows);

    const revenue = summarizeRevenueGroups(groups);

    return {
      period: {
        startDate: filter.startDate ?? null,
        endDate: filter.endDate ?? null,
      },
      ...revenue,
      totalBookings: groups.reduce((sum, group) => sum + group.count, 0),
    };
  }
}

export const bookingRepository = new BookingRepository();
