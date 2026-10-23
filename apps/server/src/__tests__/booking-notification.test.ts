import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookingService } from '../services/booking.service.js';
import { AdminBookingService } from '../services/admin-booking.service.js';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { BookingResponseDto } from '../types/booking.type.js';
import { AdminBookingResponseDto } from '../types/admin-booking.type.js';

describe('Booking Notification Integration', () => {
  let mockBookingRepo: any;
  let mockAdminBookingRepo: any;
  let mockUserRepo: any;
  let mockNotificationService: any;

  const validRoomId = '11111111-1111-4111-8111-111111111111';
  const userId = 'user-uuid-1';

  const mockBooking: BookingResponseDto = {
    id: 'booking-1',
    bookingCode: 'CS-20261014-ABCD',
    room: {
      id: validRoomId,
      name: 'Deluxe Creative Room',
    },
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

  const mockUser = {
    id: userId,
    email: 'client@example.com',
    fullName: 'Nguyen Thi B',
    passwordHash: 'hash',
    phoneNumber: '0901234567',
    role: 'CUSTOMER' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockBookingRepo = {
      createBooking: vi.fn().mockResolvedValue(mockBooking),
      findManyAndCountForUser: vi.fn().mockResolvedValue([1, [mockBooking]]),
      findByIdForUser: vi.fn().mockResolvedValue(mockBooking),
      cancelBooking: vi.fn().mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
        cancellationReason: 'Bận việc đột xuất',
      }),
    };

    const mockAdminBooking: AdminBookingResponseDto = {
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
    };

    mockAdminBookingRepo = {
      findManyAndCountForAdmin: vi.fn().mockResolvedValue([1, [mockAdminBooking]]),
      confirmPaymentForAdmin: vi.fn(),
      cancelBookingForAdmin: vi.fn().mockResolvedValue(mockAdminBooking),
      completeBookingForAdmin: vi.fn(),
      markNoShowForAdmin: vi.fn(),
      evaluateNoShowBookings: vi.fn().mockResolvedValue(0),
      calculateRevenue: vi.fn(),
    };

    mockUserRepo = {
      findById: vi.fn().mockResolvedValue(mockUser),
      findByEmail: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
    };

    mockNotificationService = {
      sendBookingConfirmation: vi.fn().mockResolvedValue(true),
      sendBookingCancellation: vi.fn().mockResolvedValue(true),
    };
  });

  describe('BookingService Email Triggers', () => {
    it('triggers sendBookingConfirmation on successful createBooking', async () => {
      const service = new BookingService(
        mockBookingRepo,
        mockUserRepo,
        mockNotificationService,
      );

      const now = new Date('2026-10-14T08:00:00Z');
      const result = await service.createBooking(
        userId,
        {
          roomId: validRoomId,
          startTime: '2026-10-14T10:00:00.000Z',
          endTime: '2026-10-14T12:00:00.000Z',
          note: null,
        },
        now,
      );

      expect(result.id).toBe('booking-1');
      expect(mockNotificationService.sendBookingConfirmation).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.sendBookingConfirmation).toHaveBeenCalledWith({
        recipientEmail: 'client@example.com',
        customerName: 'Nguyen Thi B',
        bookingCode: 'CS-20261014-ABCD',
        roomName: 'Deluxe Creative Room',
        startTime: mockBooking.startTime,
        endTime: mockBooking.endTime,
        totalAmount: '300000.00',
      });
    });

    it('does not fail booking creation when email notification throws error', async () => {
      mockNotificationService.sendBookingConfirmation.mockRejectedValue(
        new Error('SMTP Transport Failure'),
      );

      const service = new BookingService(
        mockBookingRepo,
        mockUserRepo,
        mockNotificationService,
      );

      const now = new Date('2026-10-14T08:00:00Z');
      const result = await service.createBooking(
        userId,
        {
          roomId: validRoomId,
          startTime: '2026-10-14T10:00:00.000Z',
          endTime: '2026-10-14T12:00:00.000Z',
          note: null,
        },
        now,
      );

      expect(result.id).toBe('booking-1');
      expect(mockBookingRepo.createBooking).toHaveBeenCalledTimes(1);
    });

    it('triggers sendBookingCancellation on customer cancelBooking', async () => {
      const service = new BookingService(
        mockBookingRepo,
        mockUserRepo,
        mockNotificationService,
      );

      const result = await service.cancelBooking(userId, 'booking-1');

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(mockNotificationService.sendBookingCancellation).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.sendBookingCancellation).toHaveBeenCalledWith({
        recipientEmail: 'client@example.com',
        customerName: 'Nguyen Thi B',
        bookingCode: 'CS-20261014-ABCD',
        roomName: 'Deluxe Creative Room',
        startTime: mockBooking.startTime,
        endTime: mockBooking.endTime,
        reason: 'Bận việc đột xuất',
      });
    });

    it('does not fail cancellation when email notification throws error', async () => {
      mockNotificationService.sendBookingCancellation.mockRejectedValue(
        new Error('SMTP Network Offline'),
      );

      const service = new BookingService(
        mockBookingRepo,
        mockUserRepo,
        mockNotificationService,
      );

      const result = await service.cancelBooking(userId, 'booking-1');

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(mockBookingRepo.cancelBooking).toHaveBeenCalledTimes(1);
    });

    it('does not send cancellation email if booking was already cancelled (isNewlyCancelled: false)', async () => {
      mockBookingRepo.cancelBooking.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
        cancellationReason: 'Bận việc đột xuất',
        isNewlyCancelled: false,
      });

      const service = new BookingService(
        mockBookingRepo,
        mockUserRepo,
        mockNotificationService,
      );

      const result = await service.cancelBooking(userId, 'booking-1');

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(mockNotificationService.sendBookingCancellation).not.toHaveBeenCalled();
    });
  });

  describe('AdminBookingService Email Triggers', () => {
    it('triggers sendBookingCancellation on admin cancelBooking when customer is registered', async () => {
      const bookingService = new BookingService(
        mockBookingRepo,
        mockUserRepo,
        mockNotificationService,
      );
      const adminService = new AdminBookingService(
        bookingService,
        mockAdminBookingRepo,
        mockNotificationService,
      );

      const result = await adminService.cancelBooking('booking-1', 'Admin hủy theo yêu cầu');

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(mockNotificationService.sendBookingCancellation).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.sendBookingCancellation).toHaveBeenCalledWith({
        recipientEmail: 'client@example.com',
        customerName: 'Nguyen Thi B',
        bookingCode: 'CS-20261014-ABCD',
        roomName: 'Deluxe Creative Room',
        startTime: mockBooking.startTime,
        endTime: mockBooking.endTime,
        reason: 'Admin hủy theo yêu cầu',
      });
    });

    it('does not send cancellation email on idempotent admin cancellation (isNewlyCancelled: false)', async () => {
      const mockAdminBookingCancelled: AdminBookingResponseDto = {
        ...mockBooking,
        status: BookingStatus.CANCELLED,
        cancellationReason: 'Admin hủy theo yêu cầu',
        isNewlyCancelled: false,
        customer: {
          kind: 'USER',
          id: userId,
          name: 'Nguyen Thi B',
          email: 'client@example.com',
          phone: '0901234567',
        },
      };
      mockAdminBookingRepo.cancelBookingForAdmin.mockResolvedValue(mockAdminBookingCancelled);

      const bookingService = new BookingService(
        mockBookingRepo,
        mockUserRepo,
        mockNotificationService,
      );
      const adminService = new AdminBookingService(
        bookingService,
        mockAdminBookingRepo,
        mockNotificationService,
      );

      const result = await adminService.cancelBooking('booking-1', 'Admin hủy theo yêu cầu');

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(mockNotificationService.sendBookingCancellation).not.toHaveBeenCalled();
    });

    it('does not send cancellation email for guest walk-in customer (kind: GUEST)', async () => {
      const mockGuestBooking: AdminBookingResponseDto = {
        ...mockBooking,
        status: BookingStatus.CANCELLED,
        cancellationReason: 'Admin hủy đơn vãng lai',
        isNewlyCancelled: true,
        customer: {
          kind: 'GUEST',
          name: 'Nguyen Van Khach',
          phone: '0912345678',
        },
      };
      mockAdminBookingRepo.cancelBookingForAdmin.mockResolvedValue(mockGuestBooking);

      const bookingService = new BookingService(
        mockBookingRepo,
        mockUserRepo,
        mockNotificationService,
      );
      const adminService = new AdminBookingService(
        bookingService,
        mockAdminBookingRepo,
        mockNotificationService,
      );

      const result = await adminService.cancelBooking('booking-1', 'Admin hủy đơn vãng lai');

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(mockNotificationService.sendBookingCancellation).not.toHaveBeenCalled();
    });
  });
});
