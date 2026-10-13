import nodemailer, { Transporter } from 'nodemailer';
import { ENV } from '../config/env.config.js';

export interface NotificationConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
}

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
    this.config = config ?? {
      smtpHost: ENV.SMTP_HOST,
      smtpPort: ENV.SMTP_PORT,
      smtpSecure: ENV.SMTP_SECURE,
      smtpUser: ENV.SMTP_USER,
      smtpPass: ENV.SMTP_PASS,
      smtpFrom: ENV.SMTP_FROM,
    };

    if (this.config.smtpUser && this.config.smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtpHost || 'smtp.gmail.com',
        port: this.config.smtpPort || 587,
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
  }

  async sendBookingConfirmation(payload: BookingConfirmationEmailPayload): Promise<boolean> {
    if (!this.transporter) {
      console.warn(
        `[NotificationService] SMTP credentials not configured; skipping email delivery for booking ${payload.bookingCode}`,
      );
      return true;
    }

    try {
      const formattedAmount = formatVND(payload.totalAmount);
      const startFormatted = formatDate(payload.startTime);
      const endFormatted = formatDate(payload.endTime);

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2b6cb0;">Xác nhận đặt phòng thành công</h2>
          <p>Xin chào <strong>${payload.customerName}</strong>,</p>
          <p>Đơn đặt phòng của bạn đã được xác nhận thành công tại <strong>Co-Space Working</strong>.</p>
          <div style="background-color: #f7fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 6px 0;"><strong>Mã đặt phòng:</strong> ${payload.bookingCode}</p>
            <p style="margin: 6px 0;"><strong>Phòng:</strong> ${payload.roomName}</p>
            <p style="margin: 6px 0;"><strong>Thời gian bắt đầu:</strong> ${startFormatted}</p>
            <p style="margin: 6px 0;"><strong>Thời gian kết thúc:</strong> ${endFormatted}</p>
            <p style="margin: 6px 0;"><strong>Tổng tiền:</strong> ${formattedAmount}</p>
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
    } catch (err: any) {
      console.error(
        `[NotificationService] Error sending booking confirmation email for ${payload.bookingCode}: ${err.message || 'Unknown error'}`,
      );
      return false;
    }
  }

  async sendBookingCancellation(payload: BookingCancellationEmailPayload): Promise<boolean> {
    if (!this.transporter) {
      console.warn(
        `[NotificationService] SMTP credentials not configured; skipping email delivery for cancellation ${payload.bookingCode}`,
      );
      return true;
    }

    try {
      const startFormatted = formatDate(payload.startTime);
      const endFormatted = formatDate(payload.endTime);
      const reasonDisplay = payload.reason ? payload.reason : 'Theo yêu cầu của khách hàng';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #c53030;">Thông báo hủy đặt phòng</h2>
          <p>Xin chào <strong>${payload.customerName}</strong>,</p>
          <p>Đơn đặt phòng của bạn tại <strong>Co-Space Working</strong> đã được hủy.</p>
          <div style="background-color: #fff5f5; padding: 16px; border-radius: 6px; margin: 20px 0; border: 1px solid #fed7d7;">
            <p style="margin: 6px 0;"><strong>Mã đặt phòng:</strong> ${payload.bookingCode}</p>
            <p style="margin: 6px 0;"><strong>Phòng:</strong> ${payload.roomName}</p>
            <p style="margin: 6px 0;"><strong>Thời gian:</strong> ${startFormatted} - ${endFormatted}</p>
            <p style="margin: 6px 0;"><strong>Lý do hủy:</strong> ${reasonDisplay}</p>
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
    } catch (err: any) {
      console.error(
        `[NotificationService] Error sending booking cancellation email for ${payload.bookingCode}: ${err.message || 'Unknown error'}`,
      );
      return false;
    }
  }
}

export const notificationService = new NotificationService();
