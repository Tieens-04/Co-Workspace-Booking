import { BookingStatus, PaymentStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { lockRoomRow } from './room.repository.js';
import { BLOCKING_BOOKING_STATUSES, BookingResponseDto } from '../types/booking.type.js';
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

export interface BookingRepositoryContract {
  createBooking(data: CreateBookingRepoInput): Promise<BookingResponseDto>;
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
}

export const bookingRepository = new BookingRepository();
