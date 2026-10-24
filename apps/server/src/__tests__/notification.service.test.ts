import { describe, it, expect, vi, beforeEach } from 'vitest';
import nodemailer from 'nodemailer';
import {
  NotificationService,
  BookingConfirmationEmailPayload,
  BookingCancellationEmailPayload,
} from '../services/notification.service.js';

describe('NotificationService (Unit)', () => {
  let mockSendMail: ReturnType<typeof vi.fn>;
  let mockTransporter: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-message-id-123' });
    mockTransporter = {
      sendMail: mockSendMail,
    };
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue(mockTransporter);
  });

  it('sends booking confirmation email with sanitized details and valid format', async () => {
    const service = new NotificationService({
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: 'test@gmail.com',
      smtpPass: 'app-password-123',
      smtpFrom: '"Co-Space Working" <no-reply@co-space.local>',
    });

    const payload: BookingConfirmationEmailPayload = {
      recipientEmail: 'customer@example.com',
      customerName: 'Nguyen Van A',
      bookingCode: 'CS-20261013-ABCD',
      roomName: 'Creative Room 101',
      startTime: new Date('2026-10-14T09:00:00Z'),
      endTime: new Date('2026-10-14T11:00:00Z'),
      totalAmount: '200000.00',
    };

    const result = await service.sendBookingConfirmation(payload);

    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.to).toBe('customer@example.com');
    expect(mailOptions.subject).toContain('Xác nhận đặt phòng');
    expect(mailOptions.subject).toContain('CS-20261013-ABCD');
    expect(mailOptions.html).toContain('Nguyen Van A');
    expect(mailOptions.html).toContain('Creative Room 101');
    expect(mailOptions.html).toContain('CS-20261013-ABCD');
    expect(mailOptions.html).toContain('200.000');
  });

  it('sends booking cancellation email with reason', async () => {
    const service = new NotificationService({
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: 'test@gmail.com',
      smtpPass: 'app-password-123',
      smtpFrom: '"Co-Space Working" <no-reply@co-space.local>',
    });

    const payload: BookingCancellationEmailPayload = {
      recipientEmail: 'customer@example.com',
      customerName: 'Nguyen Van A',
      bookingCode: 'CS-20261013-ABCD',
      roomName: 'Creative Room 101',
      startTime: new Date('2026-10-14T09:00:00Z'),
      endTime: new Date('2026-10-14T11:00:00Z'),
      reason: 'Khách yêu cầu hủy sớm trước 2 tiếng',
    };

    const result = await service.sendBookingCancellation(payload);

    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.to).toBe('customer@example.com');
    expect(mailOptions.subject).toContain('Thông báo hủy đặt phòng');
    expect(mailOptions.subject).toContain('CS-20261013-ABCD');
    expect(mailOptions.html).toContain('Khách yêu cầu hủy sớm trước 2 tiếng');
  });

  it('handles SMTP error gracefully without throwing, returning false and logging safely', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSendMail.mockRejectedValue(new Error('Connection timeout to SMTP server'));

    const service = new NotificationService({
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: 'test@gmail.com',
      smtpPass: 'app-password-123',
      smtpFrom: '"Co-Space Working" <no-reply@co-space.local>',
    });

    const payload: BookingConfirmationEmailPayload = {
      recipientEmail: 'customer@example.com',
      customerName: 'Nguyen Van A',
      bookingCode: 'CS-20261013-ABCD',
      roomName: 'Creative Room 101',
      startTime: new Date('2026-10-14T09:00:00Z'),
      endTime: new Date('2026-10-14T11:00:00Z'),
      totalAmount: '200000.00',
    };

    // Must NOT throw
    const result = await service.sendBookingConfirmation(payload);

    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('runs in fallback test mode when SMTP credentials are not configured without crashing', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const service = new NotificationService({
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      smtpFrom: '"Co-Space Working" <no-reply@co-space.local>',
    });

    const payload: BookingConfirmationEmailPayload = {
      recipientEmail: 'customer@example.com',
      customerName: 'Nguyen Van A',
      bookingCode: 'CS-20261013-ABCD',
      roomName: 'Creative Room 101',
      startTime: new Date('2026-10-14T09:00:00Z'),
      endTime: new Date('2026-10-14T11:00:00Z'),
      totalAmount: '200000.00',
    };

    const result = await service.sendBookingConfirmation(payload);

    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SMTP unconfigured; email delivery disabled'),
    );
  });

  const payload = {
    recipientEmail: 'customer@example.com',
    customerName: 'Customer',
    bookingCode: 'CS-20261013-ABCD',
    roomName: 'Room',
    startTime: '2026-10-14T09:00:00Z',
    endTime: '2026-10-14T10:00:00Z',
    totalAmount: '100000',
  };

  it('disables an invalid injected configuration without creating a transport, warning only once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = new NotificationService({
      smtpUser: 'secret-user',
      smtpPass: 'secret-pass',
      smtpPort: 0,
    });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(await service.sendBookingConfirmation(payload)).toBe(false);
    expect(await service.sendBookingCancellation(payload)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('SMTP invalid; email delivery disabled; fields=SMTP_PORT'),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-');
  });

  it.each(['confirmation', 'cancellation'] as const)(
    'redacts %s failures and allowlists error codes',
    async (operation) => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      const service = new NotificationService({ smtpUser: 'secret-user', smtpPass: 'secret-pass' });
      const send = () =>
        operation === 'confirmation'
          ? service.sendBookingConfirmation(payload)
          : service.sendBookingCancellation(payload);
      for (const code of ['EAUTH', 'ETIMEDOUT', 'secret-pass']) {
        mockSendMail.mockRejectedValue(
          Object.assign(new Error('secret-user secret-pass SMTP response'), {
            code,
            response: 'secret-pass',
          }),
        );
        expect(await send()).toBe(false);
        expect(errorLog).toHaveBeenLastCalledWith(
          `[Email] ${operation} delivery failed for ${payload.bookingCode}; code=${code === 'secret-pass' ? 'UNKNOWN' : code}`,
        );
      }
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('secret-');
      mockSendMail.mockResolvedValue({ messageId: 'accepted' });
      expect(await send()).toBe(true);
    },
  );
});
