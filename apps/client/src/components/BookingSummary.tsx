import React from 'react';
import { BookingResult } from '../types/booking';
import { formatCurrency } from '../utils/format';

const formatVietnamDateTime = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
};

const BOOKING_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: 'Đã xác nhận', className: 'badge-confirmed' },
  COMPLETED: { label: 'Đã hoàn tất', className: 'badge-completed' },
  CANCELLED: { label: 'Đã hủy', className: 'badge-cancelled' },
  NO_SHOW: { label: 'Không đến', className: 'badge-no-show' },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  UNPAID: { label: 'Chưa thanh toán', className: 'badge-unpaid' },
  PAID: { label: 'Đã thanh toán', className: 'badge-paid' },
};

const getPaymentMethodLabel = (method: string | null): string => {
  if (!method) return 'Chưa có';
  if (method === 'CASH') return 'Tiền mặt';
  if (method === 'QR') return 'Chuyển khoản QR';
  return method;
};

interface BookingSummaryProps {
  booking: BookingResult;
  showPaymentDetails?: boolean;
  showNote?: boolean;
}

export const BookingSummary: React.FC<BookingSummaryProps> = ({
  booking,
  showPaymentDetails = false,
  showNote = false,
}) => {
  const statusCfg = BOOKING_STATUS_CONFIG[booking.status] || {
    label: booking.status,
    className: 'badge-neutral',
  };

  const paymentCfg = PAYMENT_STATUS_CONFIG[booking.paymentStatus] || {
    label: booking.paymentStatus,
    className: 'badge-neutral',
  };

  return (
    <div className="booking-summary-fields">
      <div className="summary-field-row">
        <span className="summary-label">Mã đặt phòng:</span>
        <strong className="summary-value" data-testid="booking-code-value">
          {booking.bookingCode}
        </strong>
      </div>

      <div className="summary-field-row">
        <span className="summary-label">Phòng làm việc:</span>
        <span className="summary-value" data-testid="booking-room-value">
          {booking.room.name}
        </span>
      </div>

      <div className="summary-field-row">
        <span className="summary-label">Thời gian:</span>
        <span className="summary-value" data-testid="booking-time-value">
          <time dateTime={booking.startTime}>{formatVietnamDateTime(booking.startTime)}</time>
          {' – '}
          <time dateTime={booking.endTime}>{formatVietnamDateTime(booking.endTime)}</time>{' '}
          <span className="timezone-tag">(Giờ Việt Nam)</span>
        </span>
      </div>

      <div className="summary-field-row">
        <span className="summary-label">Tổng tiền:</span>
        <strong className="summary-value price-text" data-testid="booking-total-value">
          {formatCurrency(booking.totalAmount)}
        </strong>
      </div>

      <div className="summary-field-row">
        <span className="summary-label">Trạng thái đặt phòng:</span>
        <span className="summary-value">
          <span className={`badge ${statusCfg.className}`} data-testid="booking-status-badge">
            {statusCfg.label}
          </span>
        </span>
      </div>

      {showPaymentDetails && (
        <>
          <div className="summary-field-row">
            <span className="summary-label">Trạng thái thanh toán:</span>
            <span className="summary-value">
              <span className={`badge ${paymentCfg.className}`} data-testid="payment-status-badge">
                {paymentCfg.label}
              </span>
            </span>
          </div>

          <div className="summary-field-row">
            <span className="summary-label">Phương thức thanh toán:</span>
            <span className="summary-value" data-testid="payment-method-value">
              {getPaymentMethodLabel(booking.paymentMethod)}
            </span>
          </div>
        </>
      )}

      {showNote && (
        <div className="summary-field-row">
          <span className="summary-label">Ghi chú:</span>
          <span className="summary-value note-text" data-testid="booking-note-value">
            {booking.note && booking.note.trim() !== '' ? booking.note : 'Không có'}
          </span>
        </div>
      )}
    </div>
  );
};
