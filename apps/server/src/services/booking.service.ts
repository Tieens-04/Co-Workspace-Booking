import type { AuditActor } from '../repositories/audit.repository.js';
import {
  BookingIdentity,
  BookingRepositoryContract,
  bookingRepository,
  CreatedBookingResult,
} from '../repositories/booking.repository.js';
import { BookingIdempotency, hashBookingIntent } from '../utils/idempotency.util.js';
import { CreateBookingInput, RescheduleBookingBodyInput } from '../validators/booking.validator.js';
import { CreateGuestBookingInput } from '../validators/admin-booking.validator.js';
import {
  BookingResponseDto,
  FindUserBookingsFilter,
  GetBookingsResponseData,
} from '../types/booking.type.js';
import { emailOutboxService, EmailOutboxService } from './email-outbox.service.js';
import { ENV } from '../config/env.config.js';
import { AppError } from '../utils/error.util.js';
import { paymentInstructionsFor } from '../utils/payment-instructions.util.js';
import { MAX_CODE_RETRIES, runBookingCodeRetries } from '../utils/booking-code-retry.util.js';

export { MAX_CODE_RETRIES };

export class BookingService {
  constructor(
    private readonly bookingRepo: BookingRepositoryContract = bookingRepository,
    private readonly emailOutbox: Pick<EmailOutboxService, 'kick'> = emailOutboxService,
  ) {}

  async createBooking(
    userId: string,
    input: CreateBookingInput,
    now = new Date(),
    idempotencyKey?: string,
  ): Promise<CreatedBookingResult> {
    const idempotency = idempotencyKey
      ? { scope: `user:${userId}`, key: idempotencyKey, hash: hashBookingIntent(input) }
      : undefined;
    const booking = await this.createBookingInternal({ userId }, input, now, idempotency);
    return { ...booking, paymentInstructions: paymentInstructionsFor(booking, ENV.PAYMENT) };
  }

  async createGuestBooking(
    input: CreateGuestBookingInput,
    now = new Date(),
    retry?: { adminId: string; idempotencyKey: string },
    auditActor?: AuditActor,
  ): Promise<CreatedBookingResult> {
    const idempotency = retry
      ? {
          scope: `admin:${retry.adminId}`,
          key: retry.idempotencyKey,
          hash: hashBookingIntent(input),
        }
      : undefined;
    return this.createBookingInternal(
      {
        userId: null,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
      },
      input,
      now,
      idempotency,
      auditActor,
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
    idempotency?: BookingIdempotency,
    auditActor?: AuditActor,
  ): Promise<CreatedBookingResult> {
    const booking = await runBookingCodeRetries(
      input,
      now,
      idempotency,
      (candidateCode, startDate, endDate, durationMinutes) =>
        this.bookingRepo.createBooking({
          ...identity,
          roomId: input.roomId,
          bookingCode: candidateCode,
          startDate,
          endDate,
          durationMinutes,
          note: input.note,
          idempotency,
          ...(auditActor ? { auditActor } : {}),
        }),
    );
    // The email was queued in the booking transaction; a replay queued nothing new.
    if (identity.userId && !booking.idempotentReplay) this.emailOutbox.kick();
    return booking;
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

  async getBookingById(userId: string, id: string, now?: Date): Promise<BookingResponseDto> {
    const booking =
      now !== undefined
        ? await this.bookingRepo.findByIdForUser(userId, id, now)
        : await this.bookingRepo.findByIdForUser(userId, id);
    if (!booking) {
      throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy đặt phòng', 404);
    }
    return { ...booking, paymentInstructions: paymentInstructionsFor(booking, ENV.PAYMENT) };
  }

  async cancelBooking(
    userId: string,
    id: string,
    clock?: (() => Date) | Date,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingRepo.cancelBooking(userId, id, clock);

    // The cancellation email was queued in the cancel transaction (once per booking).
    if (booking.isNewlyCancelled !== false) this.emailOutbox.kick();

    return booking;
  }

  async rescheduleBooking(
    userId: string,
    id: string,
    input: RescheduleBookingBodyInput,
    clock?: (() => Date) | Date,
  ): Promise<BookingResponseDto> {
    const { isRescheduled, ...booking } = await this.bookingRepo.rescheduleBooking(
      userId,
      id,
      input,
      clock,
    );
    if (isRescheduled === true) this.emailOutbox.kick();
    return { ...booking, paymentInstructions: paymentInstructionsFor(booking, ENV.PAYMENT) };
  }
}

export const bookingService = new BookingService();
