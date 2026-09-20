import { Prisma } from '@prisma/client';
import {
  BookingRepositoryContract,
  bookingRepository,
} from '../repositories/booking.repository.js';
import { CreateBookingInput } from '../validators/booking.validator.js';
import { BookingResponseDto } from '../types/booking.type.js';
import { validateBookingTime } from '../utils/booking-time.util.js';
import { generateBookingCode } from '../utils/booking-code.util.js';
import { AppError } from '../utils/error.util.js';

export const MAX_CODE_RETRIES = 5;

export class BookingService {
  constructor(private readonly bookingRepo: BookingRepositoryContract = bookingRepository) {}

  async createBooking(
    userId: string,
    input: CreateBookingInput,
    now = new Date(),
  ): Promise<BookingResponseDto> {
    const startDate = new Date(input.startTime);
    const endDate = new Date(input.endTime);

    // Validate 30-min alignment, duration (1h - 8h), end > start, not past, advance notice >= 30m
    validateBookingTime(startDate, endDate, now);

    const durationMinutes = (endDate.getTime() - startDate.getTime()) / (60 * 1000);

    // Code collision retry loop (up to MAX_CODE_RETRIES)
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      const candidateCode = generateBookingCode(startDate);
      try {
        return await this.bookingRepo.createBooking({
          userId,
          roomId: input.roomId,
          bookingCode: candidateCode,
          startDate,
          endDate,
          durationMinutes,
          note: input.note,
        });
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
}

export const bookingService = new BookingService();
