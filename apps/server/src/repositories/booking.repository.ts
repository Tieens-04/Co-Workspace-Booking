import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { lockRoomRow } from './room.repository.js';
import {
  BLOCKING_BOOKING_STATUSES,
  BookingResponseDto,
  FindUserBookingsFilter,
} from '../types/booking.type.js';
import { calculateBookingTotal } from '../utils/booking-time.util.js';
import { AppError } from '../utils/error.util.js';

export interface CreateBookingRepoInput {
  userId: string;
  roomId: string;
  bookingCode: string;
  startDate: Date;
  endDate: Date;
  durationMinutes: number;
  note?: string | null;
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

export interface BookingRepositoryContract {
  createBooking(data: CreateBookingRepoInput): Promise<BookingResponseDto>;
  findManyAndCountForUser(
    userId: string,
    filter: FindUserBookingsFilter,
    now: Date,
  ): Promise<[number, BookingResponseDto[]]>;
  findByIdForUser(userId: string, id: string): Promise<BookingResponseDto | null>;
}

export class BookingRepository implements BookingRepositoryContract {
  async createBooking(data: CreateBookingRepoInput): Promise<BookingResponseDto> {
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
          userId: data.userId,
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
}

export const bookingRepository = new BookingRepository();
