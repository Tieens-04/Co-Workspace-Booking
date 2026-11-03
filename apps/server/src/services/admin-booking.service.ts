import { PaymentMethod } from '@prisma/client';
import type { AuditActor } from '../repositories/audit.repository.js';
import {
  AdminBookingRepositoryContract,
  bookingRepository,
} from '../repositories/booking.repository.js';
import { bookingService as defaultBookingService, BookingService } from './booking.service.js';
import {
  AdminBookingListResponseData,
  AdminBookingResponseDto,
  FindAdminBookingsFilter,
  RevenuePeriodFilter,
  AdminRevenueResponseDto,
} from '../types/admin-booking.type.js';
import { CreateGuestBookingInput } from '../validators/admin-booking.validator.js';
import { emailOutboxService, EmailOutboxService } from './email-outbox.service.js';

export class AdminBookingService {
  constructor(
    private readonly bookingService: BookingService = defaultBookingService,
    private readonly adminBookingRepo: AdminBookingRepositoryContract = bookingRepository,
    private readonly emailOutbox: Pick<EmailOutboxService, 'kick'> = emailOutboxService,
  ) {}

  async getBookings(
    filter: FindAdminBookingsFilter,
    now = new Date(),
  ): Promise<AdminBookingListResponseData> {
    await this.adminBookingRepo.evaluateNoShowBookings(now);
    const [total, items] = await this.adminBookingRepo.findManyAndCountForAdmin(filter);
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

  async createGuestBooking(
    input: CreateGuestBookingInput,
    now = new Date(),
    retry?: { adminId: string; idempotencyKey: string },
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto & { idempotentReplay?: boolean }> {
    const booking = await this.bookingService.createGuestBooking(input, now, retry, actor);
    return {
      ...booking,
      customer: {
        kind: 'GUEST',
        name: input.guestName,
        phone: input.guestPhone,
      },
    };
  }

  async confirmPayment(
    id: string,
    paymentMethod: PaymentMethod,
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto> {
    return this.adminBookingRepo.confirmPaymentForAdmin(id, paymentMethod, actor);
  }

  async cancelBooking(
    id: string,
    reason: string,
    actor?: AuditActor,
  ): Promise<AdminBookingResponseDto> {
    const booking = await this.adminBookingRepo.cancelBookingForAdmin(id, reason, actor);

    // Queued in the cancel transaction for registered customers only (guests have no email).
    if (booking.isNewlyCancelled !== false && booking.customer.kind === 'USER') {
      this.emailOutbox.kick();
    }

    return booking;
  }

  async checkInBooking(id: string, actor?: AuditActor): Promise<AdminBookingResponseDto> {
    return this.adminBookingRepo.checkInBookingForAdmin(id, undefined, actor);
  }

  async completeBooking(id: string, actor?: AuditActor): Promise<AdminBookingResponseDto> {
    return this.adminBookingRepo.completeBookingForAdmin(id, undefined, actor);
  }

  async markNoShow(id: string, actor?: AuditActor): Promise<AdminBookingResponseDto> {
    return this.adminBookingRepo.markNoShowForAdmin(id, undefined, actor);
  }

  async evaluateNoShowBookings(now = new Date()): Promise<number> {
    return this.adminBookingRepo.evaluateNoShowBookings(now);
  }

  async getRevenue(
    filter: RevenuePeriodFilter,
    now = new Date(),
  ): Promise<AdminRevenueResponseDto> {
    return this.adminBookingRepo.calculateRevenue(filter, now);
  }
}

export const adminBookingService = new AdminBookingService();
