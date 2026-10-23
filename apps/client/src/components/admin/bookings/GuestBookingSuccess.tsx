import { CircleCheck, Plus } from 'lucide-react';
import { AdminBookingItem } from '../../../types/admin-booking';
import { BookingSummary } from '../../BookingSummary';
import { Button } from '@/components/ui/button';

interface GuestBookingSuccessProps {
  booking: AdminBookingItem;
  onCreateAnother: () => void;
}

/** Confirmation shown after a walk-in booking is created. */
export function GuestBookingSuccess({ booking, onCreateAnother }: GuestBookingSuccessProps) {
  return (
    <div
      role="status"
      data-testid="guest-booking-success-box"
      className="grid animate-rise gap-4 rounded-xl border border-status-success-border bg-status-success-bg p-5"
    >
      <div className="grid gap-1 text-status-success">
        <h3 className="flex items-center gap-2 text-h3">
          <CircleCheck aria-hidden="true" className="size-5 shrink-0" />
          Đặt phòng cho khách vãng lai thành công!
        </h3>
        <p className="text-sm">
          Khách hàng: <strong className="font-semibold">{booking.customer.name}</strong> (
          <span className="tabular-nums">{booking.customer.phone}</span>)
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4 text-card-foreground">
        <BookingSummary
          booking={{
            id: booking.id,
            bookingCode: booking.bookingCode,
            room: booking.room,
            startTime: booking.startTime,
            endTime: booking.endTime,
            checkedInAt: booking.checkedInAt,
            attendanceTrackingEnabled: booking.attendanceTrackingEnabled,
            totalAmount: booking.totalAmount,
            note: booking.note,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            paymentMethod: booking.paymentMethod,
          }}
          showPaymentDetails={true}
          showNote={true}
        />
      </div>
      <div>
        <Button
          type="button"
          onClick={onCreateAnother}
          data-testid="create-another-guest-booking-btn"
        >
          <Plus aria-hidden="true" />
          Đặt đơn khác cho khách vãng lai
        </Button>
      </div>
    </div>
  );
}
