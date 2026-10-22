import type * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookingResult } from '../../types/booking';
import { formatCurrency } from '../../utils/format';
import { StatusBadge } from '../common/StatusBadge';
import { BookingTimeRange } from './BookingTimeRange';

interface BookingHistoryRowProps {
  booking: BookingResult;
}

/**
 * One ruled row of the customer's booking history: code → room → time → amount + status.
 * One DOM for every breakpoint; grid areas rearrange it (mobile card, desktop table-like row).
 */
export const BookingHistoryRow: React.FC<BookingHistoryRowProps> = ({ booking }) => (
  <article
    className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 py-5 [grid-template-areas:'code_status'_'room_room'_'time_time'_'amount_link'] md:grid-cols-[minmax(0,1.35fr)_minmax(0,1.25fr)_minmax(8.5rem,auto)_auto] md:gap-x-8 md:gap-y-1 md:py-6 md:[grid-template-areas:'code_time_amount_link'_'room_time_status_link']"
    data-testid={`booking-item-${booking.id}`}
  >
    <strong
      className="self-center text-xs font-semibold tracking-[0.06em] text-muted-foreground tabular-nums [grid-area:code] md:self-end"
      data-testid="booking-code-value"
    >
      {booking.bookingCode}
    </strong>

    <h2
      className="text-lg leading-snug font-bold tracking-[-0.01em] break-words [grid-area:room] md:self-start"
      data-testid="booking-room-value"
    >
      {booking.room.name}
    </h2>

    <p className="text-sm [grid-area:time] md:self-center" data-testid="booking-time-value">
      <BookingTimeRange
        startTime={booking.startTime}
        endTime={booking.endTime}
        showWeekday
        stacked
      />
    </p>

    <strong
      className="self-center text-base font-bold tabular-nums [grid-area:amount] md:self-end md:justify-self-end"
      data-testid="booking-total-value"
    >
      {formatCurrency(booking.totalAmount)}
    </strong>

    <StatusBadge
      kind="booking"
      status={booking.status}
      className="self-center justify-self-end [grid-area:status] md:self-start"
      data-testid="booking-status-badge"
    />

    <Button
      asChild
      variant="outline"
      size="sm"
      className="justify-self-end [grid-area:link] md:self-center"
    >
      <Link
        to={`/bookings/${booking.id}`}
        aria-label={`Xem chi tiết đơn ${booking.bookingCode}`}
        data-testid={`view-detail-${booking.id}`}
      >
        Xem chi tiết
        <ArrowRight
          aria-hidden="true"
          className="transition-transform duration-200 ease-editorial group-hover:translate-x-0.5"
        />
      </Link>
    </Button>
  </article>
);
