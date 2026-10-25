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

  describe.each(['confirmation', 'cancellation'] as const)('%s HTML safety', (operation) => {
    it.each([
      ['Tiến & < > " \'', 'Tiến &amp; &lt; &gt; &quot; &#39;'],
      ['<b>Tiến</b>', '&lt;b&gt;Tiến&lt;/b&gt;'],
      [
        '</strong><a href="https://example.com">Click</a>',
        '&lt;/strong&gt;&lt;a href=&quot;https://example.com&quot;&gt;Click&lt;/a&gt;',
      ],
      ['&lt;b&gt;', '&amp;lt;b&amp;gt;'],
      ['Phòng họp Nguyễn Tiến', 'Phòng họp Nguyễn Tiến'],
    ])('renders %j as literal text without changing the payload', async (input, escaped) => {
      const service = new NotificationService({ smtpUser: 'test-user', smtpPass: 'test-pass' });
      const emailPayload = Object.freeze({
        ...payload,
        customerName: input,
        bookingCode: input,
        roomName: input,
        reason: input,
      });
      const original = { ...emailPayload };

      const result =
        operation === 'confirmation'
          ? await service.sendBookingConfirmation(emailPayload)
          : await service.sendBookingCancellation(emailPayload);

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.html).toContain(`<strong>${escaped}</strong>`);
      expect(mail.html).toContain(`<strong>Mã đặt phòng:</strong> ${escaped}</p>`);
      expect(mail.html).toContain(`<strong>Phòng:</strong> ${escaped}</p>`);
      expect(mail.text).toContain(`Xin chào ${input},`);
      expect(mail.text).toContain(`Đơn đặt phòng ${input} tại ${input}`);
      if (operation === 'cancellation') {
        expect(mail.html).toContain(`<strong>Lý do hủy:</strong> ${escaped}</p>`);
        expect(mail.text).toContain(`Lý do hủy: ${input}`);
      }
      expect(mail.subject).toBe(
        operation === 'confirmation'
          ? `[Co-Space] Xác nhận đặt phòng ${input} - ${input}`
          : `[Co-Space] Thông báo hủy đặt phòng ${input}`,
      );
      expect(mail.to).toBe(payload.recipientEmail);
      if (input !== escaped) expect(mail.html).not.toContain(input);
      expect(emailPayload).toEqual(original);
    });
  });

  it('escapes the fallback amount only in HTML', async () => {
    const service = new NotificationService({ smtpUser: 'test-user', smtpPass: 'test-pass' });
    const totalAmount = '<b>Tiền & "phí"</b>';
    expect(await service.sendBookingConfirmation({ ...payload, totalAmount })).toBe(true);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.html).toContain(
      '<strong>Tổng tiền:</strong> &lt;b&gt;Tiền &amp; &quot;phí&quot;&lt;/b&gt;</p>',
    );
    expect(mail.html).not.toContain(totalAmount);
    expect(mail.text).toContain(`Tổng tiền: ${totalAmount}`);
  });

  it.each([undefined, null, ''])('keeps the default cancellation reason for %j', async (reason) => {
    const service = new NotificationService({ smtpUser: 'test-user', smtpPass: 'test-pass' });
    expect(await service.sendBookingCancellation({ ...payload, reason })).toBe(true);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.html).toContain('Theo yêu cầu của khách hàng');
    expect(mail.text).toContain('Lý do hủy: Theo yêu cầu của khách hàng');
  });

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
