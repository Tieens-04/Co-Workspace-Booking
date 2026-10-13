import { PaymentMethod } from '@prisma/client';
import {
  AdminBookingRepositoryContract,
  bookingRepository,
} from '../repositories/booking.repository.js';
import { bookingService as defaultBookingService, BookingService } from './booking.service.js';
import {
  AdminBookingListResponseData,
  AdminBookingResponseDto,
  FindAdminBookingsFilter,
} from '../types/admin-booking.type.js';
import { CreateGuestBookingInput } from '../validators/admin-booking.validator.js';

export class AdminBookingService {
  constructor(
    private readonly bookingService: BookingService = defaultBookingService,
    private readonly adminBookingRepo: AdminBookingRepositoryContract = bookingRepository,
  ) {}

  async getBookings(filter: FindAdminBookingsFilter): Promise<AdminBookingListResponseData> {
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
  ): Promise<AdminBookingResponseDto> {
    const booking = await this.bookingService.createGuestBooking(input, now);
    return {
      ...booking,
      customer: {
        kind: 'GUEST',
        name: input.guestName,
        phone: input.guestPhone,
      },
    };
  }

  async confirmPayment(id: string, paymentMethod: PaymentMethod): Promise<AdminBookingResponseDto> {
    return this.adminBookingRepo.confirmPaymentForAdmin(id, paymentMethod);
  }

  async cancelBooking(id: string, reason: string): Promise<AdminBookingResponseDto> {
    return this.adminBookingRepo.cancelBookingForAdmin(id, reason);
  }
}

export const adminBookingService = new AdminBookingService();
