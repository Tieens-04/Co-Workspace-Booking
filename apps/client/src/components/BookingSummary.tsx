import React from 'react';
import { BookingResult } from '../types/booking';
import { formatCurrency } from '../utils/format';
import { getPaymentMethodLabel } from '../utils/status';
import { StatusBadge } from './common/StatusBadge';
import { DetailList, DetailRow } from './booking/DetailList';
import { BookingTimeRange } from './booking/BookingTimeRange';

interface BookingSummaryProps {
  booking: BookingResult;
  showPaymentDetails?: boolean;
  showNote?: boolean;
  className?: string;
}

export const BookingSummary: React.FC<BookingSummaryProps> = ({
  booking,
  showPaymentDetails = false,
  showNote = false,
  className,
}) => {
  return (
    <DetailList className={className}>
      <DetailRow label="Mã đặt phòng">
        <strong
          className="font-semibold tracking-wide tabular-nums"
          data-testid="booking-code-value"
        >
          {booking.bookingCode}
        </strong>
      </DetailRow>

      <DetailRow label="Phòng làm việc">
        <span data-testid="booking-room-value">{booking.room.name}</span>
      </DetailRow>

      <DetailRow label="Thời gian">
        <span data-testid="booking-time-value">
          <BookingTimeRange startTime={booking.startTime} endTime={booking.endTime} />{' '}
          <span className="text-xs font-normal text-muted-foreground">(Giờ Việt Nam)</span>
        </span>
      </DetailRow>

      <DetailRow label="Tổng tiền">
        <strong className="font-semibold tabular-nums" data-testid="booking-total-value">
          {formatCurrency(booking.totalAmount)}
        </strong>
      </DetailRow>

      <DetailRow label="Trạng thái đặt phòng">
        <StatusBadge kind="booking" status={booking.status} data-testid="booking-status-badge" />
      </DetailRow>

      {showPaymentDetails && (
        <>
          <DetailRow label="Trạng thái thanh toán">
            <StatusBadge
              kind="payment"
              status={booking.paymentStatus}
              data-testid="payment-status-badge"
            />
          </DetailRow>

          <DetailRow label="Phương thức thanh toán">
            <span data-testid="payment-method-value">
              {getPaymentMethodLabel(booking.paymentMethod)}
            </span>
          </DetailRow>
        </>
      )}

      {showNote && (
        <DetailRow label="Ghi chú" valueClassName="font-normal">
          <span className="whitespace-pre-line" data-testid="booking-note-value">
            {booking.note && booking.note.trim() !== '' ? booking.note : 'Không có'}
          </span>
        </DetailRow>
      )}
    </DetailList>
  );
};
