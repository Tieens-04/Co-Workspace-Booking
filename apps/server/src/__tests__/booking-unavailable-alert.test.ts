import { describe, it, expect, vi, beforeEach } from 'vitest';
import nodemailer from 'nodemailer';
import { BookingStatus, RoomStatus } from '@prisma/client';
import { NotificationService } from '../services/notification.service.js';
import {
  resolveBookingRoomUnavailability,
  type ClosureOverlapCandidate,
} from '../repositories/booking.repository.js';

vi.mock('../utils/prisma.util.js', () => ({ default: {} }));

describe('resolveBookingRoomUnavailability (CWB-91 Unit)', () => {
  const baseBooking = {
    status: BookingStatus.CONFIRMED,
    room: { id: 'room-1', status: RoomStatus.AVAILABLE },
    startTime: new Date('2031-05-01T03:00:00.000Z'), // 10:00 VN
    endTime: new Date('2031-05-01T05:00:00.000Z'), // 12:00 VN
  };

  it('returns unavailable=false when booking is CONFIRMED on AVAILABLE room with no closures', () => {
    expect(resolveBookingRoomUnavailability(baseBooking, [])).toEqual({
      roomUnavailable: false,
      roomUnavailableReason: null,
      roomUnavailableCause: null,
    });
  });

  it('never flags non-CONFIRMED bookings even if room is MAINTENANCE/ARCHIVED or closure overlaps', () => {
    const closure: ClosureOverlapCandidate = {
      id: 'closure-1',
      roomId: null,
      startTime: new Date('2031-05-01T02:00:00.000Z'),
      endTime: new Date('2031-05-01T06:00:00.000Z'),
      reason: 'Nghỉ lễ toàn cơ sở',
    };

    for (const status of [
      BookingStatus.CANCELLED,
      BookingStatus.COMPLETED,
      BookingStatus.NO_SHOW,
    ]) {
      expect(
        resolveBookingRoomUnavailability(
          {
            ...baseBooking,
            status,
            room: { id: 'room-1', status: RoomStatus.MAINTENANCE },
          },
          [closure],
        ),
      ).toEqual({
        roomUnavailable: false,
        roomUnavailableReason: null,
        roomUnavailableCause: null,
      });
    }
  });

  it('ignores boundary-touching closures and closures on other rooms', () => {
    const nonOverlapping: ClosureOverlapCandidate[] = [
      {
        id: 'touch-before',
        roomId: 'room-1',
        startTime: new Date('2031-05-01T01:00:00.000Z'),
        endTime: baseBooking.startTime,
        reason: 'Sát biên trước',
      },
      {
        id: 'touch-after',
        roomId: null,
        startTime: baseBooking.endTime,
        endTime: new Date('2031-05-01T07:00:00.000Z'),
        reason: 'Sát biên sau',
      },
      {
        id: 'other-room',
        roomId: 'room-2',
        startTime: new Date('2031-05-01T02:00:00.000Z'),
        endTime: new Date('2031-05-01T06:00:00.000Z'),
        reason: 'Phòng khác',
      },
    ];

    expect(resolveBookingRoomUnavailability(baseBooking, nonOverlapping)).toEqual({
      roomUnavailable: false,
      roomUnavailableReason: null,
      roomUnavailableCause: null,
    });
  });

  it('prioritizes CLOSURE over ROOM_ARCHIVED over ROOM_MAINTENANCE and respects preferredClosureId', () => {
    const closures: ClosureOverlapCandidate[] = [
      {
        id: 'closure-first',
        roomId: null,
        startTime: new Date('2031-05-01T02:00:00.000Z'),
        endTime: new Date('2031-05-01T06:00:00.000Z'),
        reason: 'Bảo trì điện lưới',
      },
      {
        id: 'closure-second',
        roomId: 'room-1',
        startTime: new Date('2031-05-01T03:30:00.000Z'),
        endTime: new Date('2031-05-01T04:30:00.000Z'),
        reason: 'Sửa điều hòa phòng 1',
      },
    ];

    expect(
      resolveBookingRoomUnavailability(
        {
          ...baseBooking,
          room: { id: 'room-1', status: RoomStatus.ARCHIVED },
        },
        closures,
      ),
    ).toEqual({
      roomUnavailable: true,
      roomUnavailableReason: 'Bảo trì điện lưới',
      roomUnavailableCause: 'CLOSURE',
    });

    expect(
      resolveBookingRoomUnavailability(
        {
          ...baseBooking,
          room: { id: 'room-1', status: RoomStatus.MAINTENANCE },
        },
        closures,
        'closure-second',
      ),
    ).toEqual({
      roomUnavailable: true,
      roomUnavailableReason: 'Sửa điều hòa phòng 1',
      roomUnavailableCause: 'CLOSURE',
    });

    expect(
      resolveBookingRoomUnavailability(
        {
          ...baseBooking,
          room: { id: 'room-1', status: RoomStatus.ARCHIVED },
        },
        [],
      ),
    ).toEqual({
      roomUnavailable: true,
      roomUnavailableReason: 'Phòng đã ngừng kinh doanh',
      roomUnavailableCause: 'ROOM_ARCHIVED',
    });

    expect(
      resolveBookingRoomUnavailability(
        {
          ...baseBooking,
          room: { id: 'room-1', status: RoomStatus.MAINTENANCE },
        },
        [],
      ),
    ).toEqual({
      roomUnavailable: true,
      roomUnavailableReason: 'Phòng đang bảo trì',
      roomUnavailableCause: 'ROOM_MAINTENANCE',
    });
  });

  it('never flags ended CONFIRMED bookings (endTime <= now) even with MAINTENANCE/ARCHIVED room or overlapping closure (R01)', () => {
    const closure: ClosureOverlapCandidate = {
      id: 'closure-past',
      roomId: null,
      startTime: new Date('2031-05-01T02:00:00.000Z'),
      endTime: new Date('2031-05-01T06:00:00.000Z'),
      reason: 'Bảo trì tổng thể',
    };
    const endedBooking = {
      ...baseBooking,
      room: { id: 'room-1', status: RoomStatus.ARCHIVED },
    };

    // Exact boundary: now === endTime -> already ended, never flagged
    expect(
      resolveBookingRoomUnavailability(endedBooking, [closure], undefined, baseBooking.endTime),
    ).toEqual({
      roomUnavailable: false,
      roomUnavailableReason: null,
      roomUnavailableCause: null,
    });

    // After endTime -> never flagged
    expect(
      resolveBookingRoomUnavailability(
        endedBooking,
        [closure],
        undefined,
        new Date(baseBooking.endTime.getTime() + 60_000),
      ),
    ).toEqual({
      roomUnavailable: false,
      roomUnavailableReason: null,
      roomUnavailableCause: null,
    });

    // 1ms before endTime -> still active, flagged normally
    expect(
      resolveBookingRoomUnavailability(
        endedBooking,
        [closure],
        undefined,
        new Date(baseBooking.endTime.getTime() - 1),
      ),
    ).toEqual({
      roomUnavailable: true,
      roomUnavailableReason: 'Bảo trì tổng thể',
      roomUnavailableCause: 'CLOSURE',
    });
  });
});

describe('NotificationService.sendBookingRoomUnavailable (CWB-91 Unit)', () => {
  let mockSendMail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockSendMail = vi.fn().mockResolvedValue({ messageId: 'msg-unavail-1' });
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: mockSendMail,
    } as never);
  });

  const buildService = () =>
    new NotificationService({
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: 'test@gmail.com',
      smtpPass: 'app-password-123',
      smtpFrom: '"Co-Space Working" <no-reply@co-space.local>',
    });

  it('escapes HTML and renders closure warning without cancelling booking', async () => {
    const service = buildService();
    const sent = await service.sendBookingRoomUnavailable({
      recipientEmail: 'guest@example.com',
      customerName: 'Nguyễn <script>alert(1)</script>',
      bookingCode: 'CS-20310501-ABCD',
      roomName: 'Phòng <img src=x onerror=alert(1)>',
      startTime: new Date('2031-05-01T03:00:00.000Z'), // 10:00 VN
      endTime: new Date('2031-05-01T05:00:00.000Z'), // 12:00 VN
      totalAmount: '300000.00',
      isPaid: false,
      cause: 'CLOSURE',
      reason: 'Bảo trì & sửa chữa "khẩn cấp" <test>',
    });

    expect(sent).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('guest@example.com');
    expect(mail.subject).toContain('CS-20310501-ABCD');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('Bảo trì &amp; sửa chữa &quot;khẩn cấp&quot; &lt;test&gt;');
    expect(mail.html).toContain('10:00');
    expect(mail.html).toContain('12:00');
    expect(mail.html).toContain('vẫn được giữ');
    expect(mail.text).toContain('CS-20310501-ABCD');
  });

  it('includes front-desk support guidance when booking is PAID and returns false on SMTP error', async () => {
    const service = buildService();
    const sentPaid = await service.sendBookingRoomUnavailable({
      recipientEmail: 'paid@example.com',
      customerName: 'Trần Thị B',
      bookingCode: 'CS-20310501-PAID',
      roomName: 'Phòng Họp A',
      startTime: new Date('2031-05-01T03:00:00.000Z'),
      endTime: new Date('2031-05-01T05:00:00.000Z'),
      totalAmount: '500000.00',
      isPaid: true,
      cause: 'ROOM_MAINTENANCE',
      reason: 'Phòng đang bảo trì',
    });

    expect(sentPaid).toBe(true);
    expect(mockSendMail.mock.calls[0][0].html).toContain('đã thanh toán');
    expect(mockSendMail.mock.calls[0][0].html).toContain('quầy lễ tân');

    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection timeout'));
    const failed = await service.sendBookingRoomUnavailable({
      recipientEmail: 'paid@example.com',
      customerName: 'Trần Thị B',
      bookingCode: 'CS-20310501-PAID',
      roomName: 'Phòng Họp A',
      startTime: new Date('2031-05-01T03:00:00.000Z'),
      endTime: new Date('2031-05-01T05:00:00.000Z'),
      totalAmount: '500000.00',
      isPaid: true,
      cause: 'ROOM_ARCHIVED',
      reason: 'Phòng đã ngừng kinh doanh',
    });
    expect(failed).toBe(false);
  });
});
