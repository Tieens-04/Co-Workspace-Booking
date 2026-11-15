import nodemailer, { Transporter } from 'nodemailer';
import { ENV } from '../config/env.config.js';
import { parseSmtpConfig, type NotificationConfig } from '../config/smtp.config.js';
import { logEmailFailure } from '../utils/email-log.util.js';
import type { BookingRoomUnavailableCause } from '../types/booking.type.js';
export type { NotificationConfig } from '../config/smtp.config.js';

export interface BaseBookingEmailPayload {
  recipientEmail: string;
  customerName: string;
  bookingCode: string;
  roomName: string;
  startTime: Date | string;
  endTime: Date | string;
}

export interface BookingConfirmationEmailPayload extends BaseBookingEmailPayload {
  totalAmount: string | number;
}

export interface BookingCancellationEmailPayload extends BaseBookingEmailPayload {
  reason?: string | null;
}

export interface BookingReminderEmailPayload extends BaseBookingEmailPayload {
  totalAmount: string | number;
  isPaid: boolean;
}

export interface BookingRoomUnavailableEmailPayload extends BaseBookingEmailPayload {
  totalAmount: string | number;
  isPaid: boolean;
  cause: BookingRoomUnavailableCause;
  reason: string;
}

export interface PaymentReceiptEmailPayload extends BaseBookingEmailPayload {
  totalAmount: string | number;
  paymentMethod: 'CASH' | 'QR' | null;
  paidAt: Date | string | null;
}

export interface PasswordResetEmailPayload {
  recipientEmail: string;
  customerName: string;
  resetUrl: string;
  expiresInMinutes: number;
  /** Non-sensitive reference for failure logs (user id). */
  reference: string;
}

export interface EmailVerificationEmailPayload {
  recipientEmail: string;
  customerName: string;
  verifyUrl: string;
  expiresInMinutes: number;
  /** Non-sensitive reference for failure logs (user id). */
  reference: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });

const formatVND = (amount: string | number): string => {
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(numeric)) return String(amount);
  return new Intl.NumberFormat('vi-VN').format(numeric) + ' VNĐ';
};

const formatDate = (dateInput: Date | string): string => {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export class NotificationService {
  private readonly transporter: Transporter | null = null;
  private readonly config: NotificationConfig;

  constructor(config?: NotificationConfig) {
    const smtp = config ? parseSmtpConfig(config) : ENV.SMTP;
    this.config = smtp.config;
    if (smtp.status !== 'ready') {
      console.warn(
        `[NotificationService] SMTP ${smtp.status}; email delivery disabled; fields=${smtp.issues.join(',') || 'SMTP_USER,SMTP_PASS'}`,
      );
      return;
    }
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpSecure ?? false,
      auth: {
        user: this.config.smtpUser,
        pass: this.config.smtpPass,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  }

  /** False when SMTP is missing/invalid, i.e. no email can be delivered at all. */
  canDeliver(): boolean {
    return this.transporter !== null;
  }

  async sendPasswordReset(payload: PasswordResetEmailPayload): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2b6cb0;">Đặt lại mật khẩu</h2>
          <p>Xin chào <strong>${escapeHtml(payload.customerName)}</strong>,</p>
          <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>Co-Space Working</strong> của bạn.</p>
          <p><a href="${escapeHtml(payload.resetUrl)}" style="color: #2b6cb0;">Đặt lại mật khẩu</a> (liên kết dùng một lần, hết hạn sau ${payload.expiresInMinutes} phút).</p>
          <p>Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên.</p>
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 20px 0;" />
          <p style="color: #718096; font-size: 12px;">Co-Space Working System</p>
        </div>
      `;

      const text = `
Đặt lại mật khẩu
Xin chào ${payload.customerName},
Mở liên kết sau để đặt lại mật khẩu (dùng một lần, hết hạn sau ${payload.expiresInMinutes} phút):
${payload.resetUrl}
Nếu bạn không yêu cầu, hãy bỏ qua email này.
      `.trim();

      await this.transporter.sendMail({
        from: this.config.smtpFrom,
        to: payload.recipientEmail,
        subject: '[Co-Space] Đặt lại mật khẩu',
        text,
        html,
      });
      return true;
    } catch (err: unknown) {
      logEmailFailure('password reset', payload.reference, err);
      return false;
    }
  }

  async sendEmailVerification(payload: EmailVerificationEmailPayload): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2b6cb0;">Xác thực địa chỉ email</h2>
          <p>Xin chào <strong>${escapeHtml(payload.customerName)}</strong>,</p>
          <p>Cảm ơn bạn đã đăng ký tài khoản tại <strong>Co-Space Working</strong>.</p>
          <p>Vui lòng mở liên kết sau để xác thực email của bạn và kích hoạt tính năng đặt phòng:</p>
          <p><a href="${escapeHtml(payload.verifyUrl)}" style="color: #2b6cb0; font-weight: bold;">Xác thực email</a> (liên kết dùng một lần, hết hạn sau ${payload.expiresInMinutes} phút).</p>
          <p>Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email.</p>
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 20px 0;" />
          <p style="color: #718096; font-size: 12px;">Co-Space Working System</p>
        </div>
      `;

      const text = `
Xác thực địa chỉ email
Xin chào ${payload.customerName},
Mở liên kết sau để xác thực email của bạn (dùng một lần, hết hạn sau ${payload.expiresInMinutes} phút):
${payload.verifyUrl}
Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email.
      `.trim();

      await this.transporter.sendMail({
        from: this.config.smtpFrom,
        to: payload.recipientEmail,
        subject: '[Co-Space] Xác thực địa chỉ email',
        text,
        html,
      });

      return true;
    } catch (err: unknown) {
      logEmailFailure('verification', payload.reference, err);
      return false;
    }
  }

  async sendBookingConfirmation(payload: BookingConfirmationEmailPayload): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      const formattedAmount = formatVND(payload.totalAmount);
      const startFormatted = formatDate(payload.startTime);
      const endFormatted = formatDate(payload.endTime);

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2b6cb0;">Xác nhận đặt phòng thành công</h2>
          <p>Xin chào <strong>${escapeHtml(payload.customerName)}</strong>,</p>
          <p>Đơn đặt phòng của bạn đã được xác nhận thành công tại <strong>Co-Space Working</strong>.</p>
          <div style="background-color: #f7fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 6px 0;"><strong>Mã đặt phòng:</strong> ${escapeHtml(payload.bookingCode)}</p>
            <p style="margin: 6px 0;"><strong>Phòng:</strong> ${escapeHtml(payload.roomName)}</p>
            <p style="margin: 6px 0;"><strong>Thời gian bắt đầu:</strong> ${escapeHtml(startFormatted)}</p>
            <p style="margin: 6px 0;"><strong>Thời gian kết thúc:</strong> ${escapeHtml(endFormatted)}</p>
            <p style="margin: 6px 0;"><strong>Tổng tiền:</strong> ${escapeHtml(formattedAmount)}</p>
          </div>
          <p>Vui lòng đến đúng giờ để nhận phòng. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ ban quản lý.</p>
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 20px 0;" />
          <p style="color: #718096; font-size: 12px;">Co-Space Working System</p>
        </div>
      `;

      const text = `
Xác nhận đặt phòng thành công
Xin chào ${payload.customerName},
Đơn đặt phòng ${payload.bookingCode} tại ${payload.roomName} đã được xác nhận.
Thời gian: ${startFormatted} - ${endFormatted}
Tổng tiền: ${formattedAmount}
      `.trim();

      await this.transporter.sendMail({
        from: this.config.smtpFrom,
        to: payload.recipientEmail,
        subject: `[Co-Space] Xác nhận đặt phòng ${payload.bookingCode} - ${payload.roomName}`,
        text,
        html,
      });

      return true;
    } catch (err: unknown) {
      logEmailFailure('confirmation', payload.bookingCode, err);
      return false;
    }
  }

  /** CWB-89: receipt after an admin confirmed the payment; every value is HTML-escaped. */
  async sendPaymentReceipt(payload: PaymentReceiptEmailPayload): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      const formattedAmount = formatVND(payload.totalAmount);
      const startFormatted = formatDate(payload.startTime);
      const endFormatted = formatDate(payload.endTime);
      const paidFormatted = payload.paidAt ? formatDate(payload.paidAt) : '—';
      const method =
        payload.paymentMethod === 'QR'
          ? 'Chuyển khoản / QR'
          : payload.paymentMethod === 'CASH'
            ? 'Tiền mặt'
            : '—';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2f855a;">Biên nhận thanh toán</h2>
          <p>Xin chào <strong>${escapeHtml(payload.customerName)}</strong>,</p>
          <p>Co-Space Working đã nhận được thanh toán cho đơn đặt phòng của bạn.</p>
          <div style="background-color: #f7fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 6px 0;"><strong>Mã đặt phòng:</strong> ${escapeHtml(payload.bookingCode)}</p>
            <p style="margin: 6px 0;"><strong>Phòng:</strong> ${escapeHtml(payload.roomName)}</p>
            <p style="margin: 6px 0;"><strong>Thời gian:</strong> ${escapeHtml(startFormatted)} - ${escapeHtml(endFormatted)}</p>
            <p style="margin: 6px 0;"><strong>Số tiền đã thanh toán:</strong> ${escapeHtml(formattedAmount)}</p>
            <p style="margin: 6px 0;"><strong>Phương thức:</strong> ${escapeHtml(method)}</p>
            <p style="margin: 6px 0;"><strong>Thời điểm thanh toán:</strong> ${escapeHtml(paidFormatted)}</p>
          </div>
          <p>Vui lòng giữ email này làm biên nhận. Nếu có sai sót, vui lòng liên hệ quầy lễ tân.</p>
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 20px 0;" />
          <p style="color: #718096; font-size: 12px;">Co-Space Working System</p>
        </div>
      `;

      const text = `
Biên nhận thanh toán
Xin chào ${payload.customerName},
Đơn đặt phòng ${payload.bookingCode} tại ${payload.roomName} (${startFormatted} - ${endFormatted}) đã được thanh toán.
Số tiền: ${formattedAmount}
Phương thức: ${method}
Thời điểm thanh toán: ${paidFormatted}
      `.trim();

      await this.transporter.sendMail({
        from: this.config.smtpFrom,
        to: payload.recipientEmail,
        subject: `[Co-Space] Biên nhận thanh toán ${payload.bookingCode}`,
        text,
        html,
      });

      return true;
    } catch (err: unknown) {
      logEmailFailure('receipt', payload.bookingCode, err);
      return false;
    }
  }

  /** CWB-80: sent a few hours before the start; every user-provided value is HTML-escaped. */
  async sendBookingReminder(payload: BookingReminderEmailPayload): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      const startFormatted = formatDate(payload.startTime);
      const endFormatted = formatDate(payload.endTime);
      const formattedAmount = formatVND(payload.totalAmount);
      const paymentLine = payload.isPaid
        ? 'Đơn đã được thanh toán.'
        : `Đơn chưa thanh toán (${formattedAmount}). Bạn có thể thanh toán bằng tiền mặt hoặc chuyển khoản QR tại quầy lễ tân.`;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2b6cb0;">Nhắc lịch đặt phòng</h2>
          <p>Xin chào <strong>${escapeHtml(payload.customerName)}</strong>,</p>
          <p>Lịch đặt phòng của bạn tại <strong>Co-Space Working</strong> sắp bắt đầu.</p>
          <div style="background-color: #f7fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 6px 0;"><strong>Mã đặt phòng:</strong> ${escapeHtml(payload.bookingCode)}</p>
            <p style="margin: 6px 0;"><strong>Phòng:</strong> ${escapeHtml(payload.roomName)}</p>
            <p style="margin: 6px 0;"><strong>Thời gian:</strong> ${escapeHtml(startFormatted)} - ${escapeHtml(endFormatted)} (giờ Việt Nam)</p>
          </div>
          <p><strong>Check-in:</strong> đến quầy lễ tân đúng giờ và đọc mã đặt phòng để nhận phòng.</p>
          <p><strong>Thanh toán:</strong> ${escapeHtml(paymentLine)}</p>
          <p>Nếu không thể đến, vui lòng hủy đơn trên hệ thống sớm (tối thiểu 1 giờ trước giờ bắt đầu) để nhường chỗ cho khách khác.</p>
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 20px 0;" />
          <p style="color: #718096; font-size: 12px;">Co-Space Working System</p>
        </div>
      `;

      const text = `
Nhắc lịch đặt phòng
Xin chào ${payload.customerName},
Đơn ${payload.bookingCode} tại ${payload.roomName} sắp bắt đầu.
Thời gian: ${startFormatted} - ${endFormatted} (giờ Việt Nam)
Check-in: đến quầy lễ tân đúng giờ và đọc mã đặt phòng.
Thanh toán: ${paymentLine}
Nếu không thể đến, vui lòng hủy đơn sớm (tối thiểu 1 giờ trước giờ bắt đầu).
      `.trim();

      await this.transporter.sendMail({
        from: this.config.smtpFrom,
        to: payload.recipientEmail,
        subject: `[Co-Space] Nhắc lịch ${payload.bookingCode} - ${startFormatted}`,
        text,
        html,
      });

      return true;
    } catch (err: unknown) {
      logEmailFailure('reminder', payload.bookingCode, err);
      return false;
    }
  }

  async sendBookingCancellation(payload: BookingCancellationEmailPayload): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      const startFormatted = formatDate(payload.startTime);
      const endFormatted = formatDate(payload.endTime);
      const reasonDisplay = payload.reason ? payload.reason : 'Theo yêu cầu của khách hàng';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #c53030;">Thông báo hủy đặt phòng</h2>
          <p>Xin chào <strong>${escapeHtml(payload.customerName)}</strong>,</p>
          <p>Đơn đặt phòng của bạn tại <strong>Co-Space Working</strong> đã được hủy.</p>
          <div style="background-color: #fff5f5; padding: 16px; border-radius: 6px; margin: 20px 0; border: 1px solid #fed7d7;">
            <p style="margin: 6px 0;"><strong>Mã đặt phòng:</strong> ${escapeHtml(payload.bookingCode)}</p>
            <p style="margin: 6px 0;"><strong>Phòng:</strong> ${escapeHtml(payload.roomName)}</p>
            <p style="margin: 6px 0;"><strong>Thời gian:</strong> ${escapeHtml(startFormatted)} - ${escapeHtml(endFormatted)}</p>
            <p style="margin: 6px 0;"><strong>Lý do hủy:</strong> ${escapeHtml(reasonDisplay)}</p>
          </div>
          <p>Nếu bạn không thực hiện yêu cầu này, vui lòng liên hệ ngay với ban quản lý Co-Space.</p>
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 20px 0;" />
          <p style="color: #718096; font-size: 12px;">Co-Space Working System</p>
        </div>
      `;

      const text = `
Thông báo hủy đặt phòng
Xin chào ${payload.customerName},
Đơn đặt phòng ${payload.bookingCode} tại ${payload.roomName} đã được hủy.
Thời gian: ${startFormatted} - ${endFormatted}
Lý do hủy: ${reasonDisplay}
      `.trim();

      await this.transporter.sendMail({
        from: this.config.smtpFrom,
        to: payload.recipientEmail,
        subject: `[Co-Space] Thông báo hủy đặt phòng ${payload.bookingCode}`,
        text,
        html,
      });

      return true;
    } catch (err: unknown) {
      logEmailFailure('cancellation', payload.bookingCode, err);
      return false;
    }
  }
  async sendBookingRescheduled(payload: BookingConfirmationEmailPayload): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      const formattedAmount = formatVND(payload.totalAmount);
      const startFormatted = formatDate(payload.startTime);
      const endFormatted = formatDate(payload.endTime);

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2b6cb0;">Xác nhận đổi lịch đặt phòng thành công</h2>
          <p>Xin chào <strong>${escapeHtml(payload.customerName)}</strong>,</p>
          <p>Đơn đặt phòng của bạn đã được cập nhật lịch mới thành công tại <strong>Co-Space Working</strong>.</p>
          <div style="background-color: #f7fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 6px 0;"><strong>Mã đặt phòng:</strong> ${escapeHtml(payload.bookingCode)}</p>
            <p style="margin: 6px 0;"><strong>Phòng:</strong> ${escapeHtml(payload.roomName)}</p>
            <p style="margin: 6px 0;"><strong>Thời gian bắt đầu mới:</strong> ${escapeHtml(startFormatted)}</p>
            <p style="margin: 6px 0;"><strong>Thời gian kết thúc mới:</strong> ${escapeHtml(endFormatted)}</p>
            <p style="margin: 6px 0;"><strong>Tổng tiền mới:</strong> ${escapeHtml(formattedAmount)}</p>
          </div>
          <p>Vui lòng đến đúng giờ để nhận phòng. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ ban quản lý.</p>
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 20px 0;" />
          <p style="color: #718096; font-size: 12px;">Co-Space Working System</p>
        </div>
      `;

      const text = `
Xác nhận đổi lịch đặt phòng thành công
Xin chào ${payload.customerName},
Đơn đặt phòng ${payload.bookingCode} tại ${payload.roomName} đã được đổi lịch thành công.
Thời gian mới: ${startFormatted} - ${endFormatted}
Tổng tiền mới: ${formattedAmount}
      `.trim();

      await this.transporter.sendMail({
        from: this.config.smtpFrom,
        to: payload.recipientEmail,
        subject: `[Co-Space] Xác nhận đổi lịch đặt phòng ${payload.bookingCode} - ${payload.roomName}`,
        text,
        html,
      });

      return true;
    } catch (err: unknown) {
      logEmailFailure('reschedule', payload.bookingCode, err);
      return false;
    }
  }

  async sendBookingRoomUnavailable(payload: BookingRoomUnavailableEmailPayload): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      const formattedAmount = formatVND(payload.totalAmount);
      const startFormatted = formatDate(payload.startTime);
      const endFormatted = formatDate(payload.endTime);

      const causeTitle =
        payload.cause === 'CLOSURE'
          ? 'Khung giờ bạn đặt bị ảnh hưởng bởi lịch đóng cửa'
          : payload.cause === 'ROOM_ARCHIVED'
            ? 'Phòng bạn đặt đã ngừng kinh doanh'
            : 'Phòng bạn đặt đang chuyển sang trạng thái bảo trì';

      const paymentGuidanceHtml = payload.isPaid
        ? `<p>Đơn đặt phòng của bạn <strong>đã thanh toán (${escapeHtml(formattedAmount)})</strong>. Vui lòng liên hệ <strong>quầy lễ tân</strong> để được hỗ trợ chuyển sang phòng tương đương hoặc hoàn tiền theo chính sách.</p>`
        : `<p>Nếu thời gian bắt đầu còn từ <strong>1 giờ trở lên</strong>, bạn có thể vào mục chi tiết đơn đặt phòng trên hệ thống để <strong>đổi sang phòng/khung giờ khác</strong> phù hợp. Nếu bạn cần hỗ trợ thêm hoặc sắp đến giờ sử dụng, vui lòng liên hệ <strong>quầy lễ tân</strong>.</p>`;

      const paymentGuidanceText = payload.isPaid
        ? `Đơn đặt phòng của bạn đã thanh toán (${formattedAmount}). Vui lòng liên hệ quầy lễ tân để được hỗ trợ đổi phòng hoặc hoàn tiền.`
        : 'Nếu thời gian bắt đầu còn từ 1 giờ trở lên, bạn có thể đổi sang phòng/khung giờ khác tại trang chi tiết đơn đặt phòng, hoặc liên hệ quầy lễ tân để được hỗ trợ.';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #b7791f;">Lưu ý về tình trạng phòng đặt</h2>
          <p>Xin chào <strong>${escapeHtml(payload.customerName)}</strong>,</p>
          <p>${escapeHtml(causeTitle)} tại <strong>Co-Space Working</strong>.</p>
          <div style="background-color: #fffbeb; padding: 16px; border-radius: 6px; margin: 20px 0; border: 1px solid #f6e05e;">
            <p style="margin: 6px 0;"><strong>Mã đặt phòng:</strong> ${escapeHtml(payload.bookingCode)}</p>
            <p style="margin: 6px 0;"><strong>Phòng:</strong> ${escapeHtml(payload.roomName)}</p>
            <p style="margin: 6px 0;"><strong>Thời gian:</strong> ${escapeHtml(startFormatted)} - ${escapeHtml(endFormatted)}</p>
            <p style="margin: 6px 0;"><strong>Lý do:</strong> ${escapeHtml(payload.reason)}</p>
            <p style="margin: 6px 0;"><strong>Tổng tiền:</strong> ${escapeHtml(formattedAmount)}</p>
          </div>
          <p>Lưu ý: Đơn đặt phòng của bạn hiện <strong>vẫn được giữ</strong> trên hệ thống (không bị tự động hủy).</p>
          ${paymentGuidanceHtml}
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 20px 0;" />
          <p style="color: #718096; font-size: 12px;">Co-Space Working System</p>
        </div>
      `;

      const text = `
Lưu ý về tình trạng phòng đặt
Xin chào ${payload.customerName},
${causeTitle} tại Co-Space Working.
Mã đặt phòng: ${payload.bookingCode}
Phòng: ${payload.roomName}
Thời gian: ${startFormatted} - ${endFormatted}
Lý do: ${payload.reason}
Tổng tiền: ${formattedAmount}
Lưu ý: Đơn đặt phòng của bạn hiện vẫn được giữ trên hệ thống (không bị tự động hủy).
${paymentGuidanceText}
      `.trim();

      await this.transporter.sendMail({
        from: this.config.smtpFrom,
        to: payload.recipientEmail,
        subject: `[Co-Space] Lưu ý về phòng đặt ${payload.bookingCode} - ${payload.roomName}`,
        text,
        html,
      });

      return true;
    } catch (err: unknown) {
      logEmailFailure('room unavailable', payload.bookingCode, err);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
