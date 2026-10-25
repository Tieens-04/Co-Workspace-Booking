import { Prisma } from '@prisma/client';
import {
  BookingIdentity,
  BookingRepositoryContract,
  bookingRepository,
} from '../repositories/booking.repository.js';
import { CreateBookingInput } from '../validators/booking.validator.js';
import { CreateGuestBookingInput } from '../validators/admin-booking.validator.js';
import {
  BookingResponseDto,
  FindUserBookingsFilter,
  GetBookingsResponseData,
} from '../types/booking.type.js';
import { validateBookingTime } from '../utils/booking-time.util.js';
import { generateBookingCode } from '../utils/booking-code.util.js';
import { AppError } from '../utils/error.util.js';
import { logEmailFailure } from '../utils/email-log.util.js';
import { userRepository, UserRepository } from '../repositories/user.repository.js';
import {
  notificationService as defaultNotificationService,
  NotificationService,
} from './notification.service.js';

export const MAX_CODE_RETRIES = 5;

export class BookingService {
  constructor(
    private readonly bookingRepo: BookingRepositoryContract = bookingRepository,
    private readonly userRepo: UserRepository = userRepository,
    private readonly notificationService: NotificationService = defaultNotificationService,
  ) {}

  async createBooking(
    userId: string,
    input: CreateBookingInput,
    now = new Date(),
  ): Promise<BookingResponseDto> {
    return this.createBookingInternal({ userId }, input, now);
  }

  async createGuestBooking(
    input: CreateGuestBookingInput,
    now = new Date(),
  ): Promise<BookingResponseDto> {
    return this.createBookingInternal(
      {
        userId: null,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
      },
      input,
      now,
    );
  }

  private async createBookingInternal(
    identity: BookingIdentity,
    input: {
      roomId: string;
      startTime: string;
      endTime: string;
      note?: string | null;
    },
    now = new Date(),
  ): Promise<BookingResponseDto> {
    const startDate = new Date(input.startTime);
    const endDate = new Date(input.endTime);

    // Shared customer/guest rules include 07:00–22:00 on the same Vietnam day.
    validateBookingTime(startDate, endDate, now);

    const durationMinutes = (endDate.getTime() - startDate.getTime()) / (60 * 1000);

    // Code collision retry loop (up to MAX_CODE_RETRIES)
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      const candidateCode = generateBookingCode(startDate);
      try {
        const booking = await this.bookingRepo.createBooking({
          ...identity,
          roomId: input.roomId,
          bookingCode: candidateCode,
          startDate,
          endDate,
          durationMinutes,
          note: input.note,
        });

        if (identity.userId) {
          void (async () => {
            try {
              const user = await this.userRepo.findById(identity.userId!);
              if (user?.email) {
                await this.notificationService.sendBookingConfirmation({
                  recipientEmail: user.email,
                  customerName: user.fullName,
                  bookingCode: booking.bookingCode,
                  roomName: booking.room.name,
                  startTime: booking.startTime,
                  endTime: booking.endTime,
                  totalAmount: booking.totalAmount,
                });
              }
            } catch (notifErr: unknown) {
              logEmailFailure('confirmation', booking.bookingCode, notifErr);
            }
          })().catch(() => {});
        }

        return booking;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const targetStr = Array.isArray(err.meta?.target)
            ? (err.meta.target as string[]).join(',')
            : typeof err.meta?.target === 'string'
              ? err.meta.target
              : '';
          // Only retry if the collision is on the unique bookingCode column
          if (
            targetStr.toLowerCase().includes('booking_code') ||
            targetStr.toLowerCase().includes('bookingcode')
          ) {
            continue;
          }
        }
        throw err;
      }
    }

    throw new AppError(
      'BOOKING_CODE_CONFLICT',
      'Không thể tạo mã đặt phòng duy nhất, vui lòng thử lại',
      409,
    );
  }

  async getBookings(
    userId: string,
    filter: FindUserBookingsFilter,
    now = new Date(),
  ): Promise<GetBookingsResponseData> {
    const [total, items] = await this.bookingRepo.findManyAndCountForUser(userId, filter, now);
    const totalPages = total === 0 ? 0 : Math.ceil(total / filter.limit);

    return {
      items,
      pagination: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages,
      },
    };
  }

  async getBookingById(userId: string, id: string): Promise<BookingResponseDto> {
    const booking = await this.bookingRepo.findByIdForUser(userId, id);
    if (!booking) {
      throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
    }
    return booking;
  }

  async cancelBooking(
    userId: string,
    id: string,
    clock?: (() => Date) | Date,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingRepo.cancelBooking(userId, id, clock);

    if (booking.isNewlyCancelled !== false) {
      void (async () => {
        try {
          const user = await this.userRepo.findById(userId);
          if (user?.email) {
            await this.notificationService.sendBookingCancellation({
              recipientEmail: user.email,
              customerName: user.fullName,
              bookingCode: booking.bookingCode,
              roomName: booking.room.name,
              startTime: booking.startTime,
              endTime: booking.endTime,
              reason: booking.cancellationReason,
            });
          }
        } catch (notifErr: unknown) {
          logEmailFailure('cancellation', booking.bookingCode, notifErr);
        }
      })().catch(() => {});
    }

    return booking;
  }
}

export const bookingService = new BookingService();
