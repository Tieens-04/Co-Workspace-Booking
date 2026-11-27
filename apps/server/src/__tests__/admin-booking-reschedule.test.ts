import { describe, it, expect, vi, beforeEach } from 'vitest';
import nodemailer from 'nodemailer';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { adminRescheduleBookingBodySchema } from '../validators/admin-booking.validator.js';
import { validateBookingTime } from '../utils/booking-time.util.js';
import { AdminBookingService } from '../services/admin-booking.service.js';
import { NotificationService } from '../services/notification.service.js';
import { EmailOutboxService } from '../services/email-outbox.service.js';
import type { AdminBookingResponseDto } from '../types/admin-booking.type.js';

describe('Admin Booking Reschedule Unit Tests (CWB-98)', () => {
  describe('adminRescheduleBookingBodySchema', () => {
    const validPayload = {
      startTime: '2026-12-01T02:00:00.000Z',
      endTime: '2026-12-01T04:00:00.000Z',
      reason: 'Khách yêu cầu đổi giờ họp',
    };

    it('accepts valid payload with optional roomId, note, and acknowledgePriceDelta', () => {
      const parsed = adminRescheduleBookingBodySchema.parse({
        ...validPayload,
        roomId: '550e8400-e29b-41d4-a716-446655440000',
        note: '  Bàn thêm ghế  ',
        acknowledgePriceDelta: true,
      });
      expect(parsed.reason).toBe('Khách yêu cầu đổi giờ họp');
      expect(parsed.note).toBe('Bàn thêm ghế');
      expect(parsed.acknowledgePriceDelta).toBe(true);
    });

    it('defaults acknowledgePriceDelta to false when omitted', () => {
      const parsed = adminRescheduleBookingBodySchema.parse(validPayload);
      expect(parsed.acknowledgePriceDelta).toBe(false);
    });

    it('rejects missing or whitespace-only reason', () => {
      expect(
        adminRescheduleBookingBodySchema.safeParse({
          startTime: validPayload.startTime,
          endTime: validPayload.endTime,
        }).success,
      ).toBe(false);
      expect(
        adminRescheduleBookingBodySchema.safeParse({ ...validPayload, reason: '   ' }).success,
      ).toBe(false);
    });

    it('rejects reason exceeding 500 characters or unknown fields (.strict())', () => {
      expect(
        adminRescheduleBookingBodySchema.safeParse({ ...validPayload, reason: 'a'.repeat(501) })
          .success,
      ).toBe(false);
      expect(
        adminRescheduleBookingBodySchema.safeParse({ ...validPayload, extra: true }).success,
      ).toBe(false);
    });
  });

  describe('validateBookingTime with skipAdvanceNotice', () => {
    // 2026-12-01T02:50:00Z = 09:50 VN
    const now = new Date('2026-12-01T02:50:00.000Z');
    // 10:00 - 11:00 VN (only 10 minutes after now)
    const start10m = new Date('2026-12-01T03:00:00.000Z');
    const end10m = new Date('2026-12-01T04:00:00.000Z');

    it('rejects 10m lead time by default, but allows it when skipAdvanceNotice is true', () => {
      expect(() => validateBookingTime(start10m, end10m, now)).toThrow();
      expect(() =>
        validateBookingTime(start10m, end10m, now, 60, { skipAdvanceNotice: true }),
      ).not.toThrow();
    });

    it('still enforces PAST_TIME, INVALID_SLOT, MIN/MAX_DURATION, and OPERATING_HOURS when skipAdvanceNotice is true', () => {
      expect(() =>
        validateBookingTime(
          new Date('2026-12-01T02:30:00.000Z'),
          new Date('2026-12-01T03:30:00.000Z'),
          now,
          60,
          { skipAdvanceNotice: true },
        ),
      ).toThrow(/quá khứ/);

      expect(() =>
        validateBookingTime(
          new Date('2026-12-01T03:15:00.000Z'),
          new Date('2026-12-01T04:15:00.000Z'),
          now,
          60,
          { skipAdvanceNotice: true },
        ),
      ).toThrow(/30 phút/);

      expect(() =>
        validateBookingTime(
          new Date('2026-12-01T03:00:00.000Z'),
          new Date('2026-12-01T03:30:00.000Z'),
          now,
          60,
          { skipAdvanceNotice: true },
        ),
      ).toThrow(/tối thiểu/);

      expect(() =>
        validateBookingTime(
          new Date('2026-12-02T14:00:00.000Z'), // 21:00 VN
          new Date('2026-12-02T15:30:00.000Z'), // 22:30 VN
          now,
          60,
          { skipAdvanceNotice: true },
        ),
      ).toThrow(/07:00 đến 22:00/);

      expect(() =>
        validateBookingTime(
          new Date('2026-12-02T01:00:00.000Z'), // 08:00 VN
          new Date('2026-12-02T10:00:00.000Z'), // 17:00 VN (9h > max 8h)
          now,
          60,
          { skipAdvanceNotice: true },
        ),
      ).toThrow(/tối đa/);

      expect(() =>
        validateBookingTime(
          new Date('2027-02-15T02:00:00.000Z'), // > 60 days ahead
          new Date('2027-02-15T04:00:00.000Z'),
          now,
          60,
          { skipAdvanceNotice: true },
        ),
      ).toThrow(/60 ngày/);
    });
  });

  describe('AdminBookingService.rescheduleBooking email outbox kick', () => {
    const baseDto: AdminBookingResponseDto = {
      id: 'booking-1',
      bookingCode: 'CS-20261201-ABCD',
      room: { id: 'room-1', name: 'Room A' },
      startTime: new Date('2026-12-01T03:00:00.000Z'),
      endTime: new Date('2026-12-01T05:00:00.000Z'),
      checkedInAt: null,
      attendanceTrackingEnabled: true,
      totalAmount: '200000.00',
      note: null,
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: null,
      refundedAmount: '0.00',
      customer: {
        kind: 'USER',
        id: 'user-1',
        name: 'Nguyen Van A',
        phone: null,
        email: 'a@test.com',
      },
    };

    const makeService = (customerKind: 'USER' | 'GUEST') => {
      const rescheduleBookingForAdmin = vi.fn().mockResolvedValue({
        ...baseDto,
        customer:
          customerKind === 'USER'
            ? baseDto.customer
            : { kind: 'GUEST', name: 'Walk In', phone: '0901234567' },
      });
      const kick = vi.fn();
      const repo = { rescheduleBookingForAdmin } as never;
      const service = new AdminBookingService(undefined, repo, { kick });
      return { service, rescheduleBookingForAdmin, kick };
    };

    beforeEach(() => vi.clearAllMocks());

    it('kicks email outbox for USER bookings and does not kick for GUEST bookings', async () => {
      const userSetup = makeService('USER');
      await userSetup.service.rescheduleBooking('booking-1', {
        startTime: '2026-12-01T03:00:00.000Z',
        endTime: '2026-12-01T05:00:00.000Z',
        reason: 'Dời phòng theo yêu cầu',
      });
      expect(userSetup.kick).toHaveBeenCalledTimes(1);

      const guestSetup = makeService('GUEST');
      await guestSetup.service.rescheduleBooking('booking-1', {
        startTime: '2026-12-01T03:00:00.000Z',
        endTime: '2026-12-01T05:00:00.000Z',
        reason: 'Khách vãng lai đổi giờ',
      });
      expect(guestSetup.kick).not.toHaveBeenCalled();
    });
  });

  describe('NotificationService & EmailOutboxService BOOKING_RESCHEDULED reason rendering', () => {
    it('renders HTML-escaped reason when provided and omits it when absent', async () => {
      const sendMail = vi.fn().mockResolvedValue({});
      const transportSpy = vi
        .spyOn(nodemailer, 'createTransport')
        .mockReturnValue({ sendMail } as never);
      try {
        const notification = new NotificationService({
          smtpHost: 'localhost',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: 'u',
          smtpPass: 'p',
          smtpFrom: 'noreply@cospace.test',
        });

        await notification.sendBookingRescheduled({
          recipientEmail: 'a@example.com',
          customerName: 'An',
          bookingCode: 'CS-20261201-AAAA',
          roomName: 'Room 1',
          startTime: new Date('2026-12-01T02:00:00.000Z'),
          endTime: new Date('2026-12-01T04:00:00.000Z'),
          totalAmount: '200000.00',
          reason: 'Phòng cũ <bảo trì> điều hòa',
        });

        const firstCall = sendMail.mock.calls[0][0] as { html: string; text: string };
        expect(firstCall.html).toContain('Lý do đổi lịch:');
        expect(firstCall.html).toContain('Phòng cũ &lt;bảo trì&gt; điều hòa');
        expect(firstCall.text).toContain('Lý do đổi lịch: Phòng cũ <bảo trì> điều hòa');

        await notification.sendBookingRescheduled({
          recipientEmail: 'a@example.com',
          customerName: 'An',
          bookingCode: 'CS-20261201-AAAA',
          roomName: 'Room 1',
          startTime: new Date('2026-12-01T02:00:00.000Z'),
          endTime: new Date('2026-12-01T04:00:00.000Z'),
          totalAmount: '200000.00',
        });

        const secondCall = sendMail.mock.calls[1][0] as { html: string; text: string };
        expect(secondCall.html).not.toContain('Lý do đổi lịch');
        expect(secondCall.text).not.toContain('Lý do đổi lịch');
      } finally {
        transportSpy.mockRestore();
      }
    });

    it('passes ADMIN reschedule audit reason from EmailOutboxService to notificationService', async () => {
      const sendBookingRescheduled = vi.fn().mockResolvedValue(true);
      const mockNotification = {
        canDeliver: () => true,
        sendBookingRescheduled,
      } as unknown as NotificationService;

      const now = new Date('2026-12-01T01:00:00.000Z');
      const mockDb = {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'outbox-1' }]),
            emailOutbox: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          }),
        emailOutbox: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'outbox-1',
              kind: 'BOOKING_RESCHEDULED',
              bookingId: 'booking-1',
              attempts: 1,
              nextAttemptAt: new Date(now.getTime() + 120_000),
              booking: {
                bookingCode: 'CS-20261201-AAAA',
                status: 'CONFIRMED',
                startTime: new Date('2026-12-01T02:00:00.000Z'),
                endTime: new Date('2026-12-01T04:00:00.000Z'),
                totalAmount: { toFixed: () => '250000.00' },
                paymentStatus: 'PAID',
                paymentMethod: 'QR',
                paidAt: now,
                cancellationReason: null,
                room: { id: 'room-2', name: 'Room B', status: 'AVAILABLE' },
                user: { email: 'user@test.com', fullName: 'User', deletedAt: null },
              },
            },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        auditEvent: {
          findFirst: vi.fn().mockResolvedValue({
            actorRole: 'ADMIN',
            after: {
              roomId: 'room-2',
              startTime: '2026-12-01T02:00:00.000Z',
              endTime: '2026-12-01T04:00:00.000Z',
              reason: 'Dời sang phòng rộng hơn',
            },
          }),
        },
      } as never;

      const outboxService = new EmailOutboxService(mockNotification, mockDb);
      const res = await outboxService.processDue(now);
      expect(res.sent).toBe(1);
      expect(sendBookingRescheduled).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingCode: 'CS-20261201-AAAA',
          reason: 'Dời sang phòng rộng hơn',
        }),
      );
    });

    it('omits reason when latest audit is CUSTOMER or snapshot mismatches (R1-06)', async () => {
      const makeOutboxDb = (auditResult: unknown) => {
        const now = new Date('2026-12-01T01:00:00.000Z');
        return {
          now,
          db: {
            $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
              fn({
                $queryRaw: vi.fn().mockResolvedValue([{ id: 'outbox-1' }]),
                emailOutbox: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
              }),
            emailOutbox: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: 'outbox-1',
                  kind: 'BOOKING_RESCHEDULED',
                  bookingId: 'booking-1',
                  attempts: 1,
                  nextAttemptAt: new Date(now.getTime() + 120_000),
                  booking: {
                    bookingCode: 'CS-20261201-AAAA',
                    status: 'CONFIRMED',
                    startTime: new Date('2026-12-01T02:00:00.000Z'),
                    endTime: new Date('2026-12-01T04:00:00.000Z'),
                    totalAmount: { toFixed: () => '250000.00' },
                    paymentStatus: 'PAID',
                    paymentMethod: 'QR',
                    paidAt: now,
                    cancellationReason: null,
                    room: { id: 'room-2', name: 'Room B', status: 'AVAILABLE' },
                    user: { email: 'user@test.com', fullName: 'User', deletedAt: null },
                  },
                },
              ]),
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
            auditEvent: {
              findFirst: vi.fn().mockResolvedValue(auditResult),
            },
          } as never,
        };
      };

      const sendForCustomer = vi.fn().mockResolvedValue(true);
      const customerSetup = makeOutboxDb({
        actorRole: 'CUSTOMER',
        after: {
          roomId: 'room-2',
          startTime: '2026-12-01T02:00:00.000Z',
          endTime: '2026-12-01T04:00:00.000Z',
          reason: 'Should not appear',
        },
      });
      await new EmailOutboxService(
        { canDeliver: () => true, sendBookingRescheduled: sendForCustomer } as never,
        customerSetup.db,
      ).processDue(customerSetup.now);
      expect(sendForCustomer.mock.calls[0][0]).not.toHaveProperty('reason');

      const sendForMismatch = vi.fn().mockResolvedValue(true);
      const mismatchSetup = makeOutboxDb({
        actorRole: 'ADMIN',
        after: {
          roomId: 'room-other',
          startTime: '2026-12-01T05:00:00.000Z',
          endTime: '2026-12-01T07:00:00.000Z',
          reason: 'Stale reason from newer reschedule',
        },
      });
      await new EmailOutboxService(
        { canDeliver: () => true, sendBookingRescheduled: sendForMismatch } as never,
        mismatchSetup.db,
      ).processDue(mismatchSetup.now);
      expect(sendForMismatch.mock.calls[0][0]).not.toHaveProperty('reason');
    });
  });
});
