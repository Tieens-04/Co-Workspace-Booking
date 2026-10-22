import { useEffect, useState } from 'react';
import { Check, MoveHorizontal, Phone } from 'lucide-react';
import { AdminBookingItem } from '../../../types/admin-booking';
import { formatCurrency } from '../../../utils/format';
import { StatusBadge, ToneBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { adminHeadClass, stackedTable as st } from '../stackedTable';

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MAX_TIMEOUT_MS = 2_147_483_647;

const formatVietnamDateTime = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('vi-VN', {
      timeZone: VN_TIME_ZONE,
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

const formatVnDate = (d: Date) =>
  d.toLocaleDateString('vi-VN', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

const formatVnTime = (d: Date) =>
  d.toLocaleTimeString('vi-VN', {
    timeZone: VN_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/** "09:00 – 11:00" over "20/10/2026" when both ends fall on the same Vietnam day. */
function BookingTimeRange({ start, end }: { start: string; end: string }) {
  const s = new Date(start);
  const e = new Date(end);
  const valid = !isNaN(s.getTime()) && !isNaN(e.getTime());

  if (valid && formatVnDate(s) === formatVnDate(e)) {
    return (
      <>
        <span className="block font-medium text-foreground">
          {formatVnTime(s)} – {formatVnTime(e)}
        </span>
        <span className="block text-muted-foreground">{formatVnDate(s)}</span>
      </>
    );
  }

  return (
    <>
      <span className="block">{formatVietnamDateTime(start)}</span>
      <span className="block text-muted-foreground">đến {formatVietnamDateTime(end)}</span>
    </>
  );
}

const COLUMNS: { label: string; className?: string }[] = [
  { label: 'Mã đơn' },
  { label: 'Khách hàng' },
  { label: 'Phòng · Thời gian (Giờ VN)', className: 'min-w-[150px] whitespace-normal' },
  { label: 'Tổng tiền', className: 'text-right' },
  { label: 'Trạng thái · Thanh toán', className: 'min-w-[150px] whitespace-normal' },
  { label: 'Ghi chú' },
  { label: 'Hành động', className: 'text-right' },
];

const CELL_CLASS = cn('px-4 py-3.5 align-top', st.cell);
const TABLE_CLASS = cn('md:min-w-[980px]', st.table);

function BookingTableHeader() {
  return (
    <TableHeader className={cn('bg-muted/40', st.header)}>
      <TableRow className="hover:bg-transparent">
        {COLUMNS.map((col) => (
          <TableHead key={col.label} scope="col" className={cn(adminHeadClass, col.className)}>
            {col.label}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

/** Visible hint that the table scrolls sideways where it is wider than the viewport. */
function ScrollHint() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground max-md:hidden xl:hidden">
      <MoveHorizontal aria-hidden="true" className="size-3.5" />
      Cuộn ngang để xem thêm cột
    </p>
  );
}

const SKELETON_WIDTHS = ['w-32', 'w-32', 'w-36', 'w-20', 'w-24', 'w-24', 'w-40'];

/** Five placeholder rows with the real column layout, so the table does not jump on load. */
export function AdminBookingTableSkeleton() {
  return (
    <div
      data-testid="admin-bookings-loading"
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={st.frame}
    >
      <p className="sr-only">Đang tải danh sách đặt phòng...</p>
      <Table className={TABLE_CLASS} data-testid="admin-bookings-table-skeleton">
        <BookingTableHeader />
        <TableBody className={st.body}>
          {Array.from({ length: 5 }, (_, index) => (
            <TableRow
              key={`skeleton-row-${index}`}
              data-testid="admin-booking-skeleton-row"
              className={cn('hover:bg-transparent', st.row)}
            >
              {SKELETON_WIDTHS.map((width, cellIndex) => (
                <TableCell
                  key={cellIndex}
                  className={cn(
                    CELL_CLASS,
                    st.noLabel,
                    (cellIndex <= 1 || cellIndex === 6) && st.full,
                    (cellIndex === 3 || cellIndex === 6) && 'md:text-right',
                  )}
                >
                  <Skeleton
                    className={cn(
                      'max-w-full',
                      width,
                      cellIndex === 4 ? 'h-6 rounded-full' : 'h-4',
                      cellIndex === 6 && 'h-9 rounded-md md:ml-auto',
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface AdminBookingTableProps {
  bookings: AdminBookingItem[];
  onConfirmPayment: (booking: AdminBookingItem) => void;
  onComplete: (booking: AdminBookingItem) => void;
  onNoShow: (booking: AdminBookingItem) => void;
  onCancel: (booking: AdminBookingItem) => void;
}

/**
 * Bookings table. Lifecycle status and payment status are separate badges. Below `md` each row
 * restyles into a card with every field and action still present.
 */
export function AdminBookingTable({
  bookings,
  onConfirmPayment,
  onComplete,
  onNoShow,
  onCancel,
}: AdminBookingTableProps) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refreshClock = () => {
      clearTimeout(timer);
      const currentTime = Date.now();
      setNow(currentTime);

      let nextEndTime = Infinity;
      for (const booking of bookings) {
        const endTime = new Date(booking.endTime).getTime();
        if (booking.status === 'CONFIRMED' && endTime > currentTime) {
          nextEndTime = Math.min(nextEndTime, endTime);
        }
      }

      if (Number.isFinite(nextEndTime)) {
        timer = setTimeout(refreshClock, Math.min(nextEndTime - currentTime, MAX_TIMEOUT_MS));
      }
    };

    refreshClock();
    window.addEventListener('focus', refreshClock);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refreshClock);
    };
  }, [bookings]);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <ScrollHint />
      <div className={st.frame}>
        <Table className={TABLE_CLASS} data-testid="admin-bookings-table">
          <BookingTableHeader />
          <TableBody className={st.body}>
            {bookings.map((booking) => {
              const isGuest = booking.customer.kind === 'GUEST';
              const canPay = booking.paymentStatus === 'UNPAID' && booking.status !== 'CANCELLED';
              const isConfirmed = booking.status === 'CONFIRMED';
              const canFinalize = isConfirmed && now >= new Date(booking.endTime).getTime();

              return (
                <TableRow
                  key={booking.id}
                  data-testid={`admin-booking-row-${booking.id}`}
                  className={st.row}
                >
                  <TableCell
                    data-label={COLUMNS[0].label}
                    className={cn(CELL_CLASS, st.full, st.noLabel)}
                  >
                    <strong
                      className="font-bold tracking-[0.01em] tabular-nums max-md:text-base"
                      data-testid={`booking-code-${booking.id}`}
                    >
                      {booking.bookingCode}
                    </strong>
                  </TableCell>

                  <TableCell data-label={COLUMNS[1].label} className={cn(CELL_CLASS, st.full)}>
                    <span
                      className="block font-semibold"
                      data-testid={`customer-name-${booking.id}`}
                    >
                      {booking.customer.name}
                    </span>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <ToneBadge
                        tone={isGuest ? 'maintenance' : 'neutral'}
                        data-testid={`customer-kind-${booking.id}`}
                      >
                        {isGuest ? 'Vãng lai' : 'Tài khoản'}
                      </ToneBadge>
                      {booking.customer.phone && (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums"
                          data-testid={`customer-phone-${booking.id}`}
                        >
                          <Phone aria-hidden="true" className="size-3" />
                          {booking.customer.phone}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell
                    data-label="Phòng · Thời gian"
                    className={cn(CELL_CLASS, st.full, 'text-[0.8125rem] tabular-nums')}
                  >
                    <span className="block text-sm font-medium whitespace-normal">
                      {booking.room.name}
                    </span>
                    <span className="mt-1 block">
                      <BookingTimeRange start={booking.startTime} end={booking.endTime} />
                    </span>
                  </TableCell>

                  <TableCell
                    data-label={COLUMNS[3].label}
                    className={cn(CELL_CLASS, 'text-right font-bold tabular-nums')}
                  >
                    {formatCurrency(booking.totalAmount)}
                  </TableCell>

                  <TableCell data-label="Trạng thái" className={CELL_CLASS}>
                    <div className="flex flex-col items-start gap-1.5">
                      <StatusBadge
                        kind="booking"
                        status={booking.status}
                        data-testid={`booking-status-${booking.id}`}
                      />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusBadge
                          kind="payment"
                          status={booking.paymentStatus}
                          data-testid={`payment-status-${booking.id}`}
                        />
                        {booking.paymentStatus === 'PAID' && booking.paymentMethod && (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-semibold text-status-success"
                            data-testid={`paid-method-label-${booking.id}`}
                          >
                            <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                            {booking.paymentMethod}
                          </span>
                        )}
                      </div>
                    </div>
                    {booking.status === 'CANCELLED' && booking.cancellationReason && (
                      <div
                        className="mt-1.5 max-w-[220px] text-xs whitespace-normal text-status-cancelled"
                        data-testid={`cancellation-reason-${booking.id}`}
                      >
                        Lý do: {booking.cancellationReason}
                      </div>
                    )}
                  </TableCell>

                  <TableCell
                    data-label={COLUMNS[5].label}
                    className={cn(
                      CELL_CLASS,
                      'max-w-[180px] text-[0.8125rem] whitespace-normal text-muted-foreground',
                      !booking.note && 'max-md:hidden',
                      'max-md:max-w-none',
                    )}
                  >
                    {booking.note ? booking.note : <span aria-hidden="true">—</span>}
                  </TableCell>

                  <TableCell
                    data-label={COLUMNS[6].label}
                    className={cn(CELL_CLASS, st.full, !canPay && !isConfirmed && 'max-md:hidden')}
                  >
                    {(canPay || isConfirmed) && (
                      <div
                        className={cn(
                          'grid gap-1.5 md:ml-auto',
                          isConfirmed
                            ? 'grid-cols-2 md:w-[204px]'
                            : 'max-md:grid-cols-2 md:w-[100px]',
                        )}
                      >
                        {canPay && (
                          <Button
                            type="button"
                            size="sm"
                            data-testid={`confirm-payment-btn-${booking.id}`}
                            onClick={() => onConfirmPayment(booking)}
                          >
                            Thanh toán
                          </Button>
                        )}
                        {canFinalize && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              data-testid={`complete-booking-btn-${booking.id}`}
                              onClick={() => onComplete(booking)}
                            >
                              Hoàn tất
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              data-testid={`no-show-booking-btn-${booking.id}`}
                              onClick={() => onNoShow(booking)}
                            >
                              Không đến
                            </Button>
                          </>
                        )}
                        {isConfirmed && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-status-cancelled-bg hover:text-destructive"
                            data-testid={`cancel-booking-btn-${booking.id}`}
                            onClick={() => onCancel(booking)}
                          >
                            Hủy đơn
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
