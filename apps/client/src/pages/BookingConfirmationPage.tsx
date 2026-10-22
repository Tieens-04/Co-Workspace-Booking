import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookingResult } from '../types/booking';
import { formatCurrency } from '../utils/format';
import { AuthContext } from '../context/auth-context-base';
import { isValidBookingResult, sanitizeHistoryState } from '../utils/history';
import { ArrowLeft, ArrowRight, Banknote, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBadge } from '../components/common/StatusBadge';
import { DetailList, DetailRow } from '../components/booking/DetailList';
import { Notice } from '../components/booking/Notice';
import { CopyCodeButton } from '../components/booking/CopyCodeButton';
import { BookingTimeRange } from '../components/booking/BookingTimeRange';
import { SuccessMark } from '../components/motion/SuccessMark';

export const BookingConfirmationPage: React.FC = () => {
  const location = useLocation();
  const auth = useContext(AuthContext);
  const isAuthenticated = auth ? auth.isAuthenticated : false;
  const principal = auth ? auth.principal : null;
  const isLoading = auth ? auth.isLoading : false;

  const [snapshot] = useState<{
    booking: BookingResult;
    customerId?: string;
  } | null>(() => {
    const rawState = location.state;
    if (typeof rawState !== 'object' || rawState === null) {
      return null;
    }

    const s = rawState as Record<string, unknown>;
    let b: unknown;
    let cId: string | undefined;

    if ('booking' in s && typeof s.booking === 'object' && s.booking !== null) {
      b = s.booking;
      if ('customerId' in s && typeof s.customerId === 'string') {
        cId = s.customerId;
      }
    } else if ('bookingCode' in s && typeof s.bookingCode === 'string') {
      b = s;
      if ('customerId' in s && typeof s.customerId === 'string') {
        cId = s.customerId;
      }
    }

    if (isValidBookingResult(b)) {
      return { booking: b, customerId: cId };
    }
    return null;
  });

  const booking = snapshot?.booking;
  const customerId = snapshot?.customerId;

  const isAuthorizedCustomer = Boolean(
    isAuthenticated &&
    principal &&
    principal.role === 'CUSTOMER' &&
    customerId &&
    customerId === principal.id,
  );

  const isValidBooking = isAuthorizedCustomer && Boolean(booking);

  // Sanitize browser history state on mount to prevent
  // booking data from lingering in history across logout or navigation,
  // while strictly preserving React Router's internal navigation metadata (idx, key).
  // Note: Do not sanitize in unmount cleanup because React Router commits the destination
  // route's history entry before the unmount effect runs, which would wipe the destination's state.
  useEffect(() => {
    sanitizeHistoryState();
  }, []);

  useEffect(() => {
    if (!isLoading && (!isAuthorizedCustomer || !isValidBooking)) {
      sanitizeHistoryState();
    }
  }, [isLoading, isAuthorizedCustomer, isValidBooking]);

  if (isLoading) {
    return (
      <div className="container-page py-10 md:py-14">
        <div className="mx-auto grid max-w-3xl gap-4" role="status" aria-busy="true">
          <p className="text-sm text-muted-foreground">Đang tải...</p>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10 md:py-16">
      <div className="mx-auto max-w-5xl">
        {!isValidBooking || !booking ? (
          <EmptyState
            role="alert"
            data-testid="confirmation-empty-state"
            icon={Info}
            className="mx-auto max-w-3xl"
            title="Không tìm thấy thông tin đặt phòng"
            description={
              <>
                Trang xác nhận không có dữ liệu đặt phòng hợp lệ hoặc phiên làm việc đã kết thúc.
                Vui lòng kiểm tra lại thông tin và thực hiện đặt chỗ mới. Nếu bạn vừa đặt phòng, đơn
                vẫn được lưu trong lịch sử đặt phòng của bạn.
              </>
            }
            action={
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/bookings" data-testid="confirmation-fallback-history-btn">
                    Xem lịch sử đặt phòng
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/rooms" data-testid="confirmation-back-home-btn">
                    Về danh sách phòng
                  </Link>
                </Button>
              </div>
            }
          />
        ) : (
          <article className="grid gap-10 animate-rise" data-testid="booking-confirmation-view">
            <header
              className="grid justify-items-start gap-4 border-b border-foreground pb-8"
              role="status"
            >
              <SuccessMark />
              <h1 className="max-w-[20ch] text-display-lg font-bold">
                Đặt không gian làm việc thành công!
              </h1>
              <p className="max-w-[60ch] text-[0.9375rem] text-muted-foreground">
                Yêu cầu đặt phòng của bạn đã được hệ thống tiếp nhận và xác nhận giữ chỗ.
              </p>
            </header>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-12">
              <section
                className="grid gap-6 rounded-xl border bg-card p-6 text-card-foreground shadow-soft sm:p-8"
                aria-label="Thông tin đặt phòng"
              >
                <div className="grid gap-4 border-b border-dashed border-input pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div className="grid min-w-0 gap-1.5">
                    <p className="eyebrow">Mã đặt phòng</p>
                    <p
                      className="text-[1.75rem] leading-tight font-bold tracking-[0.01em] break-all tabular-nums sm:text-[2.25rem]"
                      data-testid="booking-confirmation-code"
                      data-booking-code={booking.bookingCode}
                    >
                      <strong className="font-bold" data-testid="booking-success-code">
                        {booking.bookingCode}
                      </strong>
                    </p>
                  </div>
                  <CopyCodeButton code={booking.bookingCode} className="justify-self-start" />
                </div>

                <DetailList className="border-t-0">
                  <DetailRow label="Phòng làm việc">
                    <strong className="font-semibold" data-testid="booking-confirmation-room">
                      {booking.room.name}
                    </strong>
                  </DetailRow>

                  <DetailRow label="Thời gian đặt chỗ">
                    <span data-testid="booking-confirmation-time">
                      <BookingTimeRange
                        startTime={booking.startTime}
                        endTime={booking.endTime}
                        showWeekday
                      />{' '}
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        (Giờ Việt Nam)
                      </span>
                    </span>
                  </DetailRow>

                  <DetailRow label="Ghi chú" valueClassName="font-normal">
                    <span className="whitespace-pre-line" data-testid="booking-confirmation-note">
                      {typeof booking.note === 'string' && booking.note.trim() !== ''
                        ? booking.note.trim()
                        : 'Không có'}
                    </span>
                  </DetailRow>

                  <DetailRow label="Trạng thái đặt chỗ">
                    <StatusWithCode
                      kind="booking"
                      status={booking.status}
                      testId="booking-confirmation-status"
                    />
                  </DetailRow>

                  <DetailRow label="Trạng thái thanh toán">
                    <StatusWithCode
                      kind="payment"
                      status={booking.paymentStatus}
                      testId="booking-confirmation-payment"
                    />
                  </DetailRow>

                  <DetailRow
                    label={
                      <span className="font-semibold text-foreground">
                        Tổng tiền (do hệ thống tính)
                      </span>
                    }
                    className="py-4"
                  >
                    <span data-testid="booking-confirmation-total">
                      <strong
                        className="text-[1.75rem] leading-tight font-bold tabular-nums"
                        data-testid="booking-success-total"
                      >
                        {formatCurrency(booking.totalAmount)}
                      </strong>
                    </span>
                  </DetailRow>
                </DetailList>
              </section>

              <aside className="grid gap-8" aria-labelledby="confirmation-next-heading">
                <section className="grid gap-4">
                  <h2 id="confirmation-next-heading" className="text-h3 font-bold">
                    Bước tiếp theo
                  </h2>
                  {/* AC2: Hướng dẫn thanh toán tại quầy */}
                  <Notice
                    tone="info"
                    icon={Banknote}
                    role="note"
                    data-testid="booking-payment-instruction"
                  >
                    <p className="font-semibold">Hướng dẫn thanh toán tại quầy:</p>
                    <p className="mt-1 text-muted-foreground">
                      Đơn đặt phòng của bạn đang ở trạng thái{' '}
                      <strong className="font-semibold text-foreground">
                        {booking.paymentStatus}
                      </strong>
                      . Vui lòng xuất trình mã đặt phòng{' '}
                      <strong className="font-semibold text-foreground tabular-nums">
                        {booking.bookingCode}
                      </strong>{' '}
                      và hoàn tất{' '}
                      <strong className="font-semibold text-foreground">thanh toán tại quầy</strong>{' '}
                      khi đến nhận phòng tại Co-Space Working.
                    </p>
                  </Notice>
                </section>

                <nav className="grid gap-2" aria-label="Thao tác tiếp theo">
                  {booking.id && (
                    <Button asChild className="w-full justify-between">
                      <Link
                        to={`/bookings/${booking.id}`}
                        data-testid="confirmation-view-detail-btn"
                      >
                        Xem chi tiết đặt phòng
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="outline" className="w-full justify-between">
                    <Link to="/bookings" data-testid="confirmation-history-btn">
                      Lịch sử đặt phòng
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-sm">
                    {booking.room?.id && (
                      <Link
                        to={`/rooms/${booking.room.id}`}
                        className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                        data-testid="confirmation-back-room-btn"
                      >
                        <ArrowLeft aria-hidden="true" className="size-4" />
                        Quay lại trang phòng
                      </Link>
                    )}
                    <Link
                      to="/rooms"
                      className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                      data-testid="confirmation-back-home-btn"
                    >
                      Về danh sách phòng
                    </Link>
                  </div>
                </nav>
              </aside>
            </div>
          </article>
        )}
      </div>
    </div>
  );
};

/** Vietnamese status badge plus the raw status code staff see at the counter. */
const StatusWithCode: React.FC<{ kind: 'booking' | 'payment'; status: string; testId: string }> = ({
  kind,
  status,
  testId,
}) => (
  <span className="inline-flex flex-wrap items-center gap-2" data-testid={testId}>
    <StatusBadge kind={kind} status={status} />
    <span className="text-xs font-normal tracking-wide text-muted-foreground tabular-nums">
      {status}
    </span>
  </span>
);
