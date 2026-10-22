import { cn } from '@/lib/utils';
import { formatVietnamDateTime, getVietnamTimeRange } from './formatBookingTime';

interface BookingTimeRangeProps {
  startTime: string;
  endTime: string;
  /** Prefix the date with the weekday ("Thứ Bảy, 25/10/2026"). */
  showWeekday?: boolean;
  /** Stack the date above the hours instead of one line. */
  stacked?: boolean;
  className?: string;
}

/**
 * Booking interval in Vietnam time. Same-day bookings read "25/10/2026 · 10:00 – 12:00";
 * overnight bookings keep both dates ("25/10/2026 22:00 – 26/10/2026 02:00").
 */
export function BookingTimeRange({
  startTime,
  endTime,
  showWeekday = false,
  stacked = false,
  className,
}: BookingTimeRangeProps) {
  const range = getVietnamTimeRange(startTime, endTime);

  if (!range) {
    return (
      <span className={cn('tabular-nums', className)}>
        {formatVietnamDateTime(startTime)} – {formatVietnamDateTime(endTime)}
      </span>
    );
  }

  if (!range.sameDay) {
    return (
      <span className={cn('tabular-nums', className)}>
        <time dateTime={startTime}>
          {range.startDate} {range.startTime}
        </time>
        {' – '}
        <time dateTime={endTime}>
          {range.endDate} {range.endTime}
        </time>
      </span>
    );
  }

  const date = showWeekday ? `${range.weekday}, ${range.startDate}` : range.startDate;

  return (
    <span className={cn('tabular-nums', stacked ? 'grid gap-0.5' : 'inline', className)}>
      <time dateTime={startTime}>{date}</time>
      {stacked ? null : (
        <span aria-hidden="true" className="px-1.5 text-muted-foreground">
          ·
        </span>
      )}
      <span>
        {stacked ? null : <span className="sr-only">, </span>}
        <time dateTime={startTime}>{range.startTime}</time>
        {' – '}
        <time dateTime={endTime}>{range.endTime}</time>
      </span>
    </span>
  );
}
