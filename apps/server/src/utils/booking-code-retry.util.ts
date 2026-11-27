import { Prisma } from '@prisma/client';
import { validateBookingTime } from './booking-time.util.js';
import { generateBookingCode } from './booking-code.util.js';
import { AppError } from './error.util.js';
import { BookingIdempotency, idempotencyKeyReused } from './idempotency.util.js';

export const MAX_CODE_RETRIES = 5;

export async function runBookingCodeRetries<T>(
  input: {
    startTime: string;
    endTime: string;
  },
  now: Date,
  idempotency: BookingIdempotency | undefined,
  persistAttempt: (
    candidateCode: string,
    startDate: Date,
    endDate: Date,
    durationMinutes: number,
  ) => Promise<T>,
): Promise<T> {
  const startDate = new Date(input.startTime);
  const endDate = new Date(input.endTime);

  // Shared customer/guest rules include 07:00–22:00 on the same Vietnam day.
  // CWB-111: when an Idempotency-Key is supplied, defer time validation to the repository
  // transaction so a retry after crossing the 30-minute lead-time boundary replays the booking.
  // (`now` only feeds this pre-transaction fast-fail; in-transaction checks read the live clock per CWB-51.)
  if (!idempotency) {
    validateBookingTime(startDate, endDate, now);
  }

  const durationMinutes = (endDate.getTime() - startDate.getTime()) / (60 * 1000);

  // Code collision retry loop (up to MAX_CODE_RETRIES)
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const candidateCode = generateBookingCode(startDate);
    try {
      return await persistAttempt(candidateCode, startDate, endDate, durationMinutes);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const targetStr = Array.isArray(err.meta?.target)
          ? (err.meta.target as string[]).join(',')
          : typeof err.meta?.target === 'string'
            ? err.meta.target
            : '';
        // Same key raced with a different intent (same intents serialize on the room lock).
        if (idempotency && targetStr.toLowerCase().includes('idempotency')) {
          throw idempotencyKeyReused();
        }
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
