import { BookingStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { lockRoomRow } from './room.repository.js';
import {
  BLOCKING_BOOKING_STATUSES,
  BookingResponseDto,
  FindUserBookingsFilter,
} from '../types/booking.type.js';
import {
  AdminBookingCustomerDto,
  AdminBookingResponseDto,
  FindAdminBookingsFilter,
} from '../types/admin-booking.type.js';
import {
  calculateBookingTotal,
  validateCustomerCancellationTime,
} from '../utils/booking-time.util.js';
import { getDayBounds } from '../utils/room-availability.util.js';
import { AppError } from '../utils/error.util.js';

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

export type CreateBookingRepoInput = {
  roomId: string;
  bookingCode: string;
  startDate: Date;
  endDate: Date;
  durationMinutes: number;
  note?: string | null;
} & BookingIdentity;

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
  totalAmount: true,
  note: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
} satisfies Prisma.BookingSelect;

export type BookingReadRecord = Prisma.BookingGetPayload<{
  select: typeof bookingReadSelect;
}>;

export function mapBookingRecordToDto(record: BookingReadRecord): BookingResponseDto {
  const totalAmount =
    record.totalAmount &&
    typeof record.totalAmount === 'object' &&
    'toFixed' in record.totalAmount &&
    typeof (record.totalAmount as { toFixed: (digits: number) => string }).toFixed === 'function'
      ? (record.totalAmount as { toFixed: (digits: number) => string }).toFixed(2)
      : Number(record.totalAmount).toFixed(2);

  return {
    id: record.id,
    bookingCode: record.bookingCode,
    room: {
      id: record.room.id,
      name: record.room.name,
    },
    startTime: record.startTime,
    endTime: record.endTime,
    totalAmount,
    note: record.note,
    status: record.status,
    paymentStatus: record.paymentStatus,
    paymentMethod: record.paymentMethod,
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
  totalAmount: true,
  note: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  cancellationReason: true,
  guestName: true,
  guestPhone: true,
  user: {
    select: {
      fullName: true,
      phoneNumber: true,
    },
  },
} satisfies Prisma.BookingSelect;

export type AdminBookingReadRecord = Prisma.BookingGetPayload<{
  select: typeof adminBookingReadSelect;
}>;

export function mapAdminBookingRecordToDto(
  record: AdminBookingReadRecord,
): AdminBookingResponseDto {
  const totalAmount =
    record.totalAmount &&
    typeof record.totalAmount === 'object' &&
    'toFixed' in record.totalAmount &&
    typeof (record.totalAmount as { toFixed: (digits: number) => string }).toFixed === 'function'
      ? (record.totalAmount as { toFixed: (digits: number) => string }).toFixed(2)
      : Number(record.totalAmount).toFixed(2);

  const customer: AdminBookingCustomerDto = record.user
    ? {
        kind: 'USER',
        name: record.user.fullName,
        phone: record.user.phoneNumber,
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
    totalAmount,
    note: record.note,
    status: record.status,
    paymentStatus: record.paymentStatus,
    paymentMethod: record.paymentMethod,
    cancellationReason: record.cancellationReason ?? null,
    customer,
  };
}

export interface BookingRepositoryContract {
  createBooking(data: CreateBookingRepoInput): Promise<BookingResponseDto>;
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
}

export interface AdminBookingRepositoryContract {
  findManyAndCountForAdmin(
    filter: FindAdminBookingsFilter,
  ): Promise<[number, AdminBookingResponseDto[]]>;
  confirmPaymentForAdmin(
    id: string,
    paymentMethod: PaymentMethod,
  ): Promise<AdminBookingResponseDto>;
  cancelBookingForAdmin(id: string, reason: string): Promise<AdminBookingResponseDto>;
}

export class BookingRepository
  implements BookingRepositoryContract, AdminBookingRepositoryContract
{
  async createBooking(data: CreateBookingRepoInput): Promise<BookingResponseDto> {
    assertValidBookingIdentity(data);
    return prisma.$transaction(async (tx) => {
      // 1. Lock room row in MySQL with FOR UPDATE
      const lockedRoom = await lockRoomRow(tx, data.roomId);

      // 2. Reject if room is currently in MAINTENANCE
      if (lockedRoom.status === 'MAINTENANCE') {
        throw new AppError(
          'ROOM_NOT_AVAILABLE',
          'Phòng đang trong trạng thái bảo trì, không thể đặt phòng',
          409,
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
        },
        include: {
          room: {
            select: { id: true, name: true },
          },
        },
      });

      return {
        id: createdBooking.id,
        bookingCode: createdBooking.bookingCode,
        room: {
          id: createdBooking.room.id,
          name: createdBooking.room.name,
        },
        startTime: createdBooking.startTime,
        endTime: createdBooking.endTime,
        totalAmount: createdBooking.totalAmount.toFixed(2),
        note: createdBooking.note,
        status: createdBooking.status,
        paymentStatus: createdBooking.paymentStatus,
        paymentMethod: createdBooking.paymentMethod,
      };
    });
  }

  async findManyAndCountForUser(
    userId: string,
    filter: FindUserBookingsFilter,
    now: Date,
  ): Promise<[number, BookingResponseDto[]]> {
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
        return mapBookingRecordToDto(existing);
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
        },
        select: bookingReadSelect,
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

  async confirmPaymentForAdmin(
    id: string,
    paymentMethod: PaymentMethod,
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
      const updated = await tx.booking.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod,
        },
        select: adminBookingReadSelect,
      });

      return mapAdminBookingRecordToDto(updated);
    });
  }

  async cancelBookingForAdmin(id: string, reason: string): Promise<AdminBookingResponseDto> {
    return prisma.$transaction(async (tx) => {
      // 1. Lock booking row in MySQL with FOR UPDATE
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: BookingStatus;
        }>
      >(Prisma.sql`SELECT id, status FROM bookings WHERE id = ${id} FOR UPDATE`);

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
        return mapAdminBookingRecordToDto(existing);
      }

      // 3. Reject if booking is already COMPLETED
      if (lockedBooking.status === BookingStatus.COMPLETED) {
        throw new AppError(
          'BOOKING_STATE_CONFLICT',
          'Không thể hủy đơn đặt phòng đã hoàn tất',
          409,
        );
      }

      // 4. Update status to CANCELLED with cancellation reason
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancellationReason: reason,
        },
        select: adminBookingReadSelect,
      });

      return mapAdminBookingRecordToDto(updated);
    });
  }
}

export const bookingRepository = new BookingRepository();
