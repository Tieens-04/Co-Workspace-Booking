import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { BookingService } from '../services/booking.service.js';
import { AdminBookingService } from '../services/admin-booking.service.js';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { BookingResponseDto } from '../types/booking.type.js';
import { AdminBookingResponseDto } from '../types/admin-booking.type.js';

/**
 * CWB-68: booking emails are queued in the repository transaction (email_outbox) and delivered
 * by EmailOutboxService. The services only nudge the worker after a real change; delivery,
 * retries and failures are covered by email-outbox.integration.test.ts.
 */
describe('Booking notification triggers (outbox)', () => {
  let mockBookingRepo: any;
  let mockAdminBookingRepo: any;
  let outbox: { kick: Mock<() => void> };

  const validRoomId = '11111111-1111-4111-8111-111111111111';
  const userId = 'user-uuid-1';
  const input = {
    roomId: validRoomId,
    startTime: '2026-10-14T10:00:00.000Z',
    endTime: '2026-10-14T12:00:00.000Z',
    note: null,
  };
  const now = new Date('2026-10-14T08:00:00Z');

  const mockBooking: BookingResponseDto = {
    id: 'booking-1',
    bookingCode: 'CS-20261014-ABCD',
    room: { id: validRoomId, name: 'Deluxe Creative Room' },
    startTime: new Date('2026-10-14T10:00:00Z'),
    endTime: new Date('2026-10-14T12:00:00Z'),
    totalAmount: '300000.00',
    note: null,
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
    paymentMethod: null,
    checkedInAt: null,
    attendanceTrackingEnabled: true,
  };
  const adminCancelled = (
    overrides: Partial<AdminBookingResponseDto> = {},
  ): AdminBookingResponseDto => ({
    ...mockBooking,
    status: BookingStatus.CANCELLED,
    cancellationReason: 'Admin hủy theo yêu cầu',
    customer: {
      kind: 'USER',
      id: userId,
      name: 'Nguyen Thi B',
      email: 'client@example.com',
      phone: '0901234567',
    },
    ...overrides,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    outbox = { kick: vi.fn<() => void>() };
    mockBookingRepo = {
      createBooking: vi.fn().mockResolvedValue(mockBooking),
      cancelBooking: vi.fn().mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
        isNewlyCancelled: true,
      }),
    };
    mockAdminBookingRepo = {
      cancelBookingForAdmin: vi.fn().mockResolvedValue(adminCancelled({ isNewlyCancelled: true })),
    };
  });

  const services = () => {
    const customer = new BookingService(mockBookingRepo, outbox);
    return { customer, admin: new AdminBookingService(customer, mockAdminBookingRepo, outbox) };
  };

  it('nudges the outbox worker after a new customer booking', async () => {
    const result = await services().customer.createBooking(userId, input, now);
    expect(result.id).toBe('booking-1');
    expect(outbox.kick).toHaveBeenCalledTimes(1);
  });

  it('does not nudge the worker for an idempotent replay (nothing new was queued)', async () => {
    mockBookingRepo.createBooking.mockResolvedValue({ ...mockBooking, idempotentReplay: true });
    await services().customer.createBooking(userId, input, now, 'retry-key-123');
    expect(outbox.kick).not.toHaveBeenCalled();
  });

  it('nudges on a new customer cancellation but not on an idempotent repeat', async () => {
    const { customer } = services();
    await customer.cancelBooking(userId, 'booking-1');
    mockBookingRepo.cancelBooking.mockResolvedValue({
      ...mockBooking,
      status: BookingStatus.CANCELLED,
      isNewlyCancelled: false,
    });
    await customer.cancelBooking(userId, 'booking-1');
    expect(outbox.kick).toHaveBeenCalledTimes(1);
  });

  it('nudges on admin cancellation of a registered customer only', async () => {
    const { admin } = services();
    await admin.cancelBooking('booking-1', 'Admin hủy theo yêu cầu');
    expect(outbox.kick).toHaveBeenCalledTimes(1);

    mockAdminBookingRepo.cancelBookingForAdmin.mockResolvedValue(
      adminCancelled({ isNewlyCancelled: false }),
    );
    await admin.cancelBooking('booking-1', 'Lặp lại');
    mockAdminBookingRepo.cancelBookingForAdmin.mockResolvedValue(
      adminCancelled({
        isNewlyCancelled: true,
        customer: { kind: 'GUEST', name: 'Khách', phone: '0912345678' },
      }),
    );
    await admin.cancelBooking('booking-2', 'Khách vãng lai');
    expect(outbox.kick).toHaveBeenCalledTimes(1);
  });
});
