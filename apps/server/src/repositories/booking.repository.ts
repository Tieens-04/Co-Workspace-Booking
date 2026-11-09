import { BookingStatus, PaymentMethod, PaymentStatus, Prisma, Role } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { summarizeRevenueGroups, toRevenueGroups } from '../utils/booking-revenue.util.js';
import { lockRoomRow, type LockedRoomRecord } from './room.repository.js';
import {
  BLOCKING_BOOKING_STATUSES,
  BookingResponseDto,
  FindUserBookingsFilter,
} from '../types/booking.type.js';
import {
  AdminBookingCustomerDto,
  AdminBookingResponseDto,
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
import { BookingIdempotency, idempotencyKeyReused } from '../utils/idempotency.util.js';
import { ENV } from '../config/env.config.js';

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

export const accountLockedError = (): AppError =>
  new AppError(
    'ACCOUNT_LOCKED',
    'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quầy lễ tân để được hỗ trợ.',
    403,
  );

export const activeBookingLimitError = (limit: number): AppError =>
  new AppError(
    'ACTIVE_BOOKING_LIMIT',
    `Bạn đã đạt giới hạn ${limit} lượt đặt phòng sắp tới. Vui lòng sử dụng hoặc hủy bớt một lượt trước khi đặt thêm.`,
    409,
    { limit },
  );

/**
 * CWB-78: a customer may hold at most `limit` upcoming CONFIRMED bookings (the "Sắp tới" view:
 * CONFIRMED and start >= now). Must run inside the booking transaction after the customer's
 * `users` row is locked, so concurrent requests of the same customer (any room) serialize here.
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
 * Limits lazy no-show evaluation to bookings overlapping [from, to) (and a room) — the rows a
 * bounded report actually reads. Bookings outside the window are evaluated when they are read.
 */
export interface NoShowScope {
  from?: Date;
  to?: Date;
  roomId?: string;
}

export type CreateBookingRepoInput = {
  roomId: string;
  bookingCode: string;
  startDate: Date;
  endDate: Date;
  durationMinutes: number;
  note?: string | null;
  /** Admin who created a walk-in booking; audited inside the create transaction. */
  auditActor?: AuditActor;
  idempotency?: BookingIdempotency;
} & BookingIdentity;

function assertRoomBookable(lockedRoom: Pick<LockedRoomRecord, 'status'>): void {
  if (lockedRoom.status === 'ARCHIVED') {
    throw new AppError(
      'ROOM_NOT_AVAILABLE',
      'Phòng đã ngừng kinh doanh, không thể đặt phòng',
      409,
    );
  }
  if (lockedRoom.status === 'MAINTENANCE') {
    throw new AppError(
      'ROOM_NOT_AVAILABLE',
      'Phòng đang trong trạng thái bảo trì, không thể đặt phòng',
      409,
    );
  }
}

/** Result of createBooking; `idempotentReplay` marks a retried request answered with the original. */
export type CreatedBookingResult = BookingResponseDto & { idempotentReplay?: boolean };

const createdBookingInclude = { room: { select: { id: true, name: true } } } as const;

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

export const bookingReadSelect = {
  id: true,
  bookingCode: true,
  room: {
    select: {
      id: true,
      name: true,
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

export function mapBookingRecordToDto(record: BookingReadRecord): BookingResponseDto {
  const totalAmount = formatAmount(record.totalAmount);

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
  };
}

export const adminBookingReadSelect = {
  id: true,
  bookingCode: true,
  room: {
    select: {
      id: true,
      name: true,
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
): AdminBookingResponseDto {
  const totalAmount = formatAmount(record.totalAmount);

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
  findByIdForUser(userId: string, id: string): Promise<BookingResponseDto | null>;
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
  ): Promise<BookingResponseDto>;
}

export interface RescheduleBookingRepoInput {
  startTime: string;
  endTime: string;
  roomId?: string;
  note?: string | null;
}

export interface AdminBookingRepositoryContract {
  findManyAndCountForAdmin(
    filter: FindAdminBookingsFilter,
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
  async createBooking(data: CreateBookingRepoInput): Promise<CreatedBookingResult> {
    assertValidBookingIdentity(data);
    return prisma.$transaction(async (tx) => {
      // 0. CWB-78: lock the customer's row first (always user -> room, no path locks the reverse)
      // so one customer's concurrent requests for different rooms serialize on the booking cap.
      if (data.userId) {
        const [account] = await tx.$queryRaw<Array<{ locked_at: Date | null }>>(
          Prisma.sql`SELECT locked_at FROM users WHERE id = ${data.userId} FOR UPDATE`,
        );
        // CWB-79: the session check runs before this transaction; re-check under the row lock so
        // a request that passed authentication just before an admin lock cannot still book.
        if (account?.locked_at) throw accountLockedError();
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
          const original = await tx.booking.findUniqueOrThrow({
            where: { id: previous.id },
            include: createdBookingInclude,
          });
          return { ...toBookingResponse(original), idempotentReplay: true };
        }
      }

      // 2. Reject if room is currently in MAINTENANCE or ARCHIVED
      assertRoomBookable(lockedRoom);

      // 2b. Upcoming-booking cap per customer (CWB-78); admin guest bookings are exempt.
      // After the idempotency replay above, so retrying an already created booking still succeeds.
      if (data.userId) {
        await assertActiveBookingCapacity(
          tx,
          data.userId,
          new Date(),
          ENV.BOOKING_MAX_ACTIVE_PER_CUSTOMER,
        );
      }

      // 3. Overlap check inside transaction:
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

      // 4. Calculate totalAmount deterministically from persisted room price
      const totalAmount = calculateBookingTotal(lockedRoom.pricePerHour, data.durationMinutes);

      // Lock waits, overlap queries, and code-collision retries can exhaust the lead time.
      validateBookingTime(data.startDate, data.endDate, new Date());

      // 5. Insert booking with initial CONFIRMED and UNPAID status
      const createdBooking = await tx.booking.create({
        data: {
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
        include: createdBookingInclude,
      });

      if (data.auditActor) {
        // Guest PII stays out of the audit trail; the booking row remains the source for it.
        await recordAuditEvent(tx, {
          actor: data.auditActor,
          action: 'BOOKING_GUEST_CREATED',
          entityType: 'BOOKING',
          entityId: createdBooking.id,
          before: null,
          after: {
            bookingCode: createdBooking.bookingCode,
            roomId: createdBooking.roomId,
            startTime: createdBooking.startTime,
            endTime: createdBooking.endTime,
            totalAmount: createdBooking.totalAmount.toFixed(2),
            status: createdBooking.status,
            paymentStatus: createdBooking.paymentStatus,
          },
        });
      }

      if (data.userId) {
        await enqueueBookingEmail(tx, 'BOOKING_CONFIRMATION', createdBooking.id);
      }

      return toBookingResponse(createdBooking);
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
      where.startTime = { gte: now };
    } else if (filter.view === 'COMPLETED') {
      where.status = BookingStatus.COMPLETED;
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

    return [total, records.map(mapBookingRecordToDto)];
  }

  async findByIdForUser(userId: string, id: string): Promise<BookingResponseDto | null> {
    await this.evaluateNoShowBookings(undefined, userId, id);
    const record = await prisma.booking.findFirst({
      where: {
        id,
        userId,
      },
      select: bookingReadSelect,
    });

    return record ? mapBookingRecordToDto(record) : null;
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
  ): Promise<BookingResponseDto> {
    return prisma.$transaction(async (tx) => {
      // 0. CWB-78: lock user row first (user -> booking -> room)
      const [account] = await tx.$queryRaw<Array<{ locked_at: Date | null }>>(
        Prisma.sql`SELECT locked_at FROM users WHERE id = ${userId} FOR UPDATE`,
      );
      if (account?.locked_at) throw accountLockedError();

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

      const evaluationTime = typeof clock === 'function' ? clock() : (clock ?? new Date());
      validateCustomerRescheduleTime(new Date(lockedBooking.start_time), evaluationTime);

      // 2. Lock target room (defaults to current room)
      const targetRoomId = input.roomId ?? lockedBooking.room_id;
      const lockedRoom = await lockRoomRow(tx, targetRoomId);
      assertRoomBookable(lockedRoom);

      // 3. Validate new time slot
      const newStartDate = new Date(input.startTime);
      const newEndDate = new Date(input.endTime);
      validateBookingTime(newStartDate, newEndDate, evaluationTime);

      // 4. Check overlap on target room, strictly excluding this booking
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

      // 5. Calculate new totalAmount deterministically
      const durationMinutes = (newEndDate.getTime() - newStartDate.getTime()) / (60 * 1000);
      const newTotalAmount = calculateBookingTotal(lockedRoom.pricePerHour, durationMinutes);

      // 6. Update booking (bookingCode is preserved)
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

      // 7. Audit log
      await recordAuditEvent(tx, {
        actor: { id: userId, role: Role.CUSTOMER },
        action: 'BOOKING_RESCHEDULED',
        entityType: 'BOOKING',
        entityId: id,
        before: {
          bookingCode: lockedBooking.booking_code,
          roomId: lockedBooking.room_id,
          startTime: new Date(lockedBooking.start_time).toISOString(),
          endTime: new Date(lockedBooking.end_time).toISOString(),
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

      // 8. Enqueue outbox email and reset/remove any prior reminder
      await tx.emailOutbox.deleteMany({
        where: { bookingId: id, kind: 'BOOKING_REMINDER' },
      });

      await tx.emailOutbox.upsert({
        where: {
          kind_bookingId: {
            kind: 'BOOKING_RESCHEDULED',
            bookingId: id,
          },
        },
        create: {
          kind: 'BOOKING_RESCHEDULED',
          bookingId: id,
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

      return mapBookingRecordToDto(updated);
    });
  }

  async findManyAndCountForAdmin(
    filter: FindAdminBookingsFilter,
  ): Promise<[number, AdminBookingResponseDto[]]> {
    const where: Prisma.BookingWhereInput = {};

    if (filter.bookingCode) {
      where.bookingCode = filter.bookingCode;
    }

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.date) {
      const { dayStart, dayEnd } = getDayBounds(filter.date);
      where.startTime = {
        gte: dayStart,
        lt: dayEnd,
      };
    }

    if (filter.customer) {
      // CWB-79: registered customers and walk-in guests; *_ci collation = case-insensitive.
      const q = filter.customer;
      where.OR = [
        { user: { email: { contains: q } } },
        { user: { fullName: { contains: q } } },
        { user: { phoneNumber: { contains: q } } },
        { guestName: { contains: q } },
        { guestPhone: { contains: q } },
      ];
    }

    const orderBy: Prisma.BookingOrderByWithRelationInput[] = [
      { startTime: 'desc' },
      { id: 'desc' },
    ];

    const skip = (filter.page - 1) * filter.limit;
    const take = filter.limit;

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

    return [total, records.map(mapAdminBookingRecordToDto)];
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
        }>
      >(
        Prisma.sql`SELECT id, status, payment_status, payment_method FROM bookings WHERE id = ${id} FOR UPDATE`,
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
        return mapAdminBookingRecordToDto(existing);
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
        },
        select: adminBookingReadSelect,
      });
      await auditBookingChange(tx, actor, 'BOOKING_PAYMENT_CONFIRMED', id, auditBefore, updated);

      return mapAdminBookingRecordToDto(updated);
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
        return mapAdminBookingRecordToDto(existing);
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
      return mapAdminBookingRecordToDto(updated);
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
    const where: Prisma.BookingWhereInput = {
      status: BookingStatus.CONFIRMED,
      checkedInAt: null,
      attendanceTrackingEnabled: true,
      // CWB-57: a scoped read only evaluates bookings overlapping the window it returns.
      endTime: { lte: now ?? new Date(), ...(scope?.from ? { gt: scope.from } : {}) },
      ...(scope?.to ? { startTime: { lt: scope.to } } : {}),
      ...(scope?.roomId ? { roomId: scope.roomId } : {}),
      ...(userId ? { userId } : {}),
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
