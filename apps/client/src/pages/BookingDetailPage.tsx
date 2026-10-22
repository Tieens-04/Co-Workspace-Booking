import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { bookingApi } from '../services/booking.api';
import { BookingResult } from '../types/booking';
import { formatCurrency } from '../utils/format';
import { getPaymentMethodLabel } from '../utils/status';
import { ArrowLeft, Banknote, LoaderCircle, RotateCw, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState, ErrorState } from '../components/common/EmptyState';
import { Notice } from '../components/booking/Notice';
import { CopyCodeButton } from '../components/booking/CopyCodeButton';
import { DetailList, DetailRow } from '../components/booking/DetailList';
import { BookingTimeRange } from '../components/booking/BookingTimeRange';
import { formatVietnamDateTime } from '../components/booking/formatBookingTime';
import { StatusBadge } from '../components/common/StatusBadge';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface BookingDetailState {
  sessionUserId: string | undefined;
  bookingId: string | undefined;
  booking: BookingResult | null;
  isLoading: boolean;
  isNotFound: boolean;
  errorMessage: string | null;
  isCancelling: boolean;
  showCancelConfirm: boolean;
  cancelFeedback: {
    type: 'success' | 'error';
    message: string;
    code?: string;
  } | null;
}

export const BookingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { principal } = useAuth();
  const { showToast } = useToast();

  const [state, setState] = useState<BookingDetailState>(() => ({
    sessionUserId: principal?.id,
    bookingId: id,
    booking: null,
    isLoading: true,
    isNotFound: false,
    errorMessage: null,
    isCancelling: false,
    showCancelConfirm: false,
    cancelFeedback: null,
  }));

  // Synchronously reset state if session or target ID changes during render before painting DOM
  if (state.sessionUserId !== principal?.id || state.bookingId !== id) {
    setState({
      sessionUserId: principal?.id,
      bookingId: id,
      booking: null,
      isLoading: true,
      isNotFound: false,
      errorMessage: null,
      isCancelling: false,
      showCancelConfirm: false,
      cancelFeedback: null,
    });
  }

  const isCurrentSession = state.sessionUserId === principal?.id;
  const isCurrentId = isCurrentSession && state.bookingId === id;

  const effectiveBooking = isCurrentId ? state.booking : null;
  const effectiveIsLoading = !isCurrentId || state.isLoading;
  const effectiveIsNotFound = isCurrentId && state.isNotFound;
  const effectiveErrorMessage = isCurrentId ? state.errorMessage : null;

  // Stale request guards
  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelAbortControllerRef = useRef<AbortController | null>(null);
  const activeSessionUserRef = useRef<string | undefined>(principal?.id);
  activeSessionUserRef.current = principal?.id;

  const fetchDetail = useCallback(() => {
    const currentRequestId = ++requestIdRef.current;
    const requestingUser = principal?.id;
    const targetId = id;

    if (!targetId || !UUID_REGEX.test(targetId)) {
      setState({
        sessionUserId: requestingUser,
        bookingId: targetId,
        booking: null,
        isLoading: false,
        isNotFound: true,
        errorMessage: null,
        isCancelling: false,
        showCancelConfirm: false,
        cancelFeedback: null,
      });
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((prev) => ({
      ...prev,
      sessionUserId: requestingUser,
      bookingId: targetId,
      isLoading: true,
      isNotFound: false,
      errorMessage: null,
      cancelFeedback: null,
    }));

    bookingApi
      .getBookingById(targetId, controller.signal)
      .then((res) => {
        if (
          controller.signal.aborted ||
          requestIdRef.current !== currentRequestId ||
          activeSessionUserRef.current !== requestingUser
        ) {
          return;
        }

        setState((prev) => ({
          ...prev,
          sessionUserId: requestingUser,
          bookingId: targetId,
          booking: res.data,
          isLoading: false,
          isNotFound: false,
          errorMessage: null,
          isCancelling: false,
          showCancelConfirm: false,
          cancelFeedback: null,
        }));
      })
      .catch((err) => {
        if (
          controller.signal.aborted ||
          err.name === 'CanceledError' ||
          err.code === 'ERR_CANCELED' ||
          requestIdRef.current !== currentRequestId ||
          activeSessionUserRef.current !== requestingUser
        ) {
          return;
        }

        const statusCode = err.response?.status;
        const errorCode = err.response?.data?.code;

        setState((prev) => ({
          ...prev,
          sessionUserId: requestingUser,
          bookingId: targetId,
          booking: null,
          isLoading: false,
          isNotFound: statusCode === 404 || errorCode === 'BOOKING_NOT_FOUND',
          errorMessage:
            statusCode === 404 || errorCode === 'BOOKING_NOT_FOUND'
              ? null
              : err.response?.data?.message || err.message || 'Không thể tải chi tiết đặt phòng',
          isCancelling: false,
          showCancelConfirm: false,
          cancelFeedback: null,
        }));
      });
  }, [id, principal?.id]);

  const handleCancelBooking = useCallback(async () => {
    if (!id || !effectiveBooking || effectiveBooking.status !== 'CONFIRMED' || state.isCancelling) {
      return;
    }

    const requestingUser = principal?.id;
    const targetId = id;

    if (cancelAbortControllerRef.current) {
      cancelAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    cancelAbortControllerRef.current = controller;

    setState((prev) => ({
      ...prev,
      isCancelling: true,
      cancelFeedback: null,
    }));

    try {
      const res = await bookingApi.cancelBooking(targetId, controller.signal);

      if (
        controller.signal.aborted ||
        activeSessionUserRef.current !== requestingUser ||
        id !== targetId
      ) {
        return;
      }

      showToast(res.message || 'Hủy đặt phòng thành công', 'success');
      setState((prev) => ({
        ...prev,
        booking: res.data,
        isCancelling: false,
        showCancelConfirm: false,
        cancelFeedback: {
          type: 'success',
          message: res.message || 'Hủy đặt phòng thành công',
        },
      }));
    } catch (err: any) {
      if (
        controller.signal.aborted ||
        err.name === 'CanceledError' ||
        err.code === 'ERR_CANCELED' ||
        activeSessionUserRef.current !== requestingUser ||
        id !== targetId
      ) {
        return;
      }

      const statusCode = err.response?.status;
      const errorCode = err.response?.data?.code;
      const errorMsg = err.response?.data?.message || err.message || 'Không thể hủy đặt phòng';

      if (statusCode === 404 || errorCode === 'BOOKING_NOT_FOUND') {
        showToast(errorMsg, 'error');
        setState((prev) => ({
          ...prev,
          booking: null,
          isLoading: false,
          isNotFound: true,
          isCancelling: false,
          showCancelConfirm: false,
          cancelFeedback: null,
        }));
        return;
      }

      showToast(errorMsg, 'error');
      setState((prev) => ({
        ...prev,
        isCancelling: false,
        cancelFeedback: {
          type: 'error',
          message: errorMsg,
          code: errorCode,
        },
      }));
    }
  }, [id, effectiveBooking, state.isCancelling, principal?.id, showToast]);

  useEffect(() => {
    fetchDetail();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (cancelAbortControllerRef.current) {
        cancelAbortControllerRef.current.abort();
      }
    };
  }, [fetchDetail]);

  const isCancelDialogOpen = Boolean(
    state.showCancelConfirm && effectiveBooking && effectiveBooking.status === 'CONFIRMED',
  );

  // Display-only hint derived from the ≥ 1 h self-cancel rule; the server decides.
  const cancelDeadline = (() => {
    if (!effectiveBooking) return null;
    const startMs = new Date(effectiveBooking.startTime).getTime();
    if (Number.isNaN(startMs)) return null;
    return formatVietnamDateTime(new Date(startMs - 60 * 60 * 1000).toISOString());
  })();

  const handleCancelDialogOpenChange = (open: boolean) => {
    // Keep the dialog open while the cancel request is in flight.
    if (!open && state.isCancelling) return;
    setState((prev) => ({ ...prev, showCancelConfirm: open }));
  };

  const renderCancelFeedback = () => {
    if (!state.cancelFeedback) return null;
    const isError = state.cancelFeedback.type === 'error';
    return (
      <Notice
        tone={isError ? 'error' : 'success'}
        role={isError ? 'alert' : 'status'}
        data-testid={`cancel-${state.cancelFeedback.type}-banner`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{state.cancelFeedback.message}</span>
          {state.cancelFeedback.code === 'BOOKING_STATE_CONFLICT' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchDetail}
              data-testid="cancel-conflict-refresh-btn"
            >
              <RotateCw aria-hidden="true" />
              Tải lại dữ liệu
            </Button>
          )}
        </div>
      </Notice>
    );
  };

  return (
    <div className="container-page py-10 md:py-14">
      <div className="mx-auto grid max-w-3xl gap-8">
        <Link
          to="/bookings"
          className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Quay lại lịch sử đặt phòng
        </Link>

        {/* Loading State */}
        {effectiveIsLoading && (
          <div
            className="grid gap-4"
            role="status"
            aria-busy="true"
            aria-label="Đang tải chi tiết đặt phòng"
          >
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="mt-4 h-7 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-4 h-32 w-full rounded-xl" />
          </div>
        )}

        {/* Not Found / IDOR State */}
        {!effectiveIsLoading && effectiveIsNotFound && (
          <EmptyState
            role="alert"
            data-testid="booking-not-found-state"
            icon={SearchX}
            title="Không tìm thấy thông tin đặt phòng"
            description="Đơn đặt phòng này không tồn tại hoặc bạn không có quyền truy cập vào thông tin này."
            action={
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/bookings">
                    <ArrowLeft aria-hidden="true" />
                    Về lịch sử đặt phòng
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/rooms">Danh sách phòng</Link>
                </Button>
              </div>
            }
          />
        )}

        {/* Error / Network Failure State */}
        {!effectiveIsLoading && !effectiveIsNotFound && effectiveErrorMessage && (
          <ErrorState
            title="Lỗi kết nối máy chủ"
            description={effectiveErrorMessage}
            onRetry={fetchDetail}
          />
        )}

        {/* Success State */}
        {!effectiveIsLoading &&
          !effectiveIsNotFound &&
          !effectiveErrorMessage &&
          effectiveBooking && (
            <article className="grid gap-8 animate-rise" data-testid="booking-detail-card">
              <header className="grid gap-8 border-b border-foreground pb-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="grid min-w-0 gap-2">
                    <p className="eyebrow">Mã đặt phòng</p>
                    <h1 className="text-[clamp(1.75rem,1.3rem+1.8vw,2.5rem)] leading-[1.1] font-bold tracking-[-0.02em] break-all tabular-nums">
                      <span className="sr-only">Chi tiết đặt phòng </span>
                      <strong className="font-bold" data-testid="detail-booking-code">
                        {effectiveBooking.bookingCode}
                      </strong>
                    </h1>
                  </div>
                  <CopyCodeButton code={effectiveBooking.bookingCode} />
                </div>

                <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div className="grid min-w-0 gap-2">
                    <p className="eyebrow">Phòng làm việc</p>
                    <h2 className="text-h2 font-bold break-words" data-testid="booking-room-value">
                      {effectiveBooking.room.name}
                    </h2>
                    <p className="text-[0.9375rem]" data-testid="booking-time-value">
                      <BookingTimeRange
                        startTime={effectiveBooking.startTime}
                        endTime={effectiveBooking.endTime}
                        showWeekday
                      />{' '}
                      <span className="text-xs text-muted-foreground">(Giờ Việt Nam)</span>
                    </p>
                  </div>
                  <div className="grid gap-2 sm:justify-items-end">
                    <p className="eyebrow">Tổng tiền</p>
                    <strong
                      className="text-h2 leading-none font-bold tabular-nums"
                      data-testid="booking-total-value"
                    >
                      {formatCurrency(effectiveBooking.totalAmount)}
                    </strong>
                    <StatusBadge
                      kind="booking"
                      status={effectiveBooking.status}
                      className="mt-1"
                      data-testid="booking-status-badge"
                    />
                  </div>
                </div>
              </header>

              {!isCancelDialogOpen && renderCancelFeedback()}

              <section aria-labelledby="payment-heading" className="grid gap-4">
                <h2 id="payment-heading" className="text-h3 font-bold">
                  Thanh toán và ghi chú
                </h2>
                <DetailList>
                  <DetailRow label="Trạng thái thanh toán">
                    <StatusBadge
                      kind="payment"
                      status={effectiveBooking.paymentStatus}
                      data-testid="payment-status-badge"
                    />
                  </DetailRow>
                  <DetailRow label="Phương thức thanh toán">
                    <span data-testid="payment-method-value">
                      {getPaymentMethodLabel(effectiveBooking.paymentMethod)}
                    </span>
                  </DetailRow>
                  <DetailRow label="Ghi chú" valueClassName="font-normal">
                    <span className="whitespace-pre-line" data-testid="booking-note-value">
                      {effectiveBooking.note && effectiveBooking.note.trim() !== ''
                        ? effectiveBooking.note
                        : 'Không có'}
                    </span>
                  </DetailRow>
                </DetailList>
                {effectiveBooking.status === 'CONFIRMED' &&
                  effectiveBooking.paymentStatus === 'UNPAID' && (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Banknote aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      Xuất trình mã đặt phòng và thanh toán tại quầy khi đến nhận phòng.
                    </p>
                  )}
              </section>

              {effectiveBooking.status === 'CONFIRMED' && (
                <section
                  className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6"
                  aria-labelledby="cancellation-heading"
                  data-testid="cancellation-section"
                >
                  <h2 id="cancellation-heading" className="text-h3 font-bold">
                    Hủy đặt phòng
                  </h2>
                  <Notice tone="info">
                    <strong className="font-semibold">Chính sách hủy đặt phòng:</strong> Quý khách
                    chỉ có thể tự hủy đơn đặt phòng trước thời gian bắt đầu ít nhất 1 giờ. Sau khi
                    hủy thành công, khung giờ sẽ được giải phóng.
                  </Notice>
                  {cancelDeadline && (
                    <p className="text-sm text-muted-foreground">
                      Hạn tự hủy:{' '}
                      <strong className="font-semibold text-foreground tabular-nums">
                        {cancelDeadline}
                      </strong>{' '}
                      (giờ Việt Nam). Sau thời điểm này, đơn không thể tự hủy trên hệ thống.
                    </p>
                  )}

                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-destructive/50 text-destructive hover:border-destructive"
                      onClick={() =>
                        setState((prev) => ({
                          ...prev,
                          showCancelConfirm: true,
                          cancelFeedback: null,
                        }))
                      }
                      data-testid="cancel-booking-init-btn"
                    >
                      Hủy đặt phòng
                    </Button>
                  </div>

                  <AlertDialog
                    open={isCancelDialogOpen}
                    onOpenChange={handleCancelDialogOpenChange}
                  >
                    <AlertDialogContent data-testid="cancellation-confirm-box">
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Bạn có chắc chắn muốn hủy đơn đặt phòng này không?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Thao tác hủy không thể hoàn tác. Khung giờ này sẽ được giải phóng cho
                          người dùng khác.
                        </AlertDialogDescription>
                      </AlertDialogHeader>

                      <p className="text-sm text-muted-foreground">
                        Đơn{' '}
                        <strong className="font-semibold text-foreground tabular-nums">
                          {effectiveBooking.bookingCode}
                        </strong>{' '}
                        · {effectiveBooking.room.name}
                      </p>

                      {isCancelDialogOpen && renderCancelFeedback()}

                      <AlertDialogFooter>
                        <AlertDialogCancel
                          variant="ghost"
                          disabled={state.isCancelling}
                          data-testid="abort-cancel-btn"
                        >
                          Đóng
                        </AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={state.isCancelling}
                          aria-busy={state.isCancelling || undefined}
                          onClick={(e) => {
                            // Stay open until the request settles; errors render inside the dialog.
                            e.preventDefault();
                            handleCancelBooking();
                          }}
                          data-testid="confirm-cancel-btn"
                        >
                          {state.isCancelling && (
                            <LoaderCircle aria-hidden="true" className="animate-spin" />
                          )}
                          {state.isCancelling ? 'Đang hủy...' : 'Xác nhận hủy'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </section>
              )}

              <nav className="flex flex-wrap gap-2 border-t pt-6" aria-label="Điều hướng đặt phòng">
                <Button asChild variant="outline">
                  <Link to="/bookings" data-testid="detail-back-history-btn">
                    <ArrowLeft aria-hidden="true" />
                    Về lịch sử đặt phòng
                  </Link>
                </Button>
                {effectiveBooking.room?.id && (
                  <Button asChild variant="outline">
                    <Link
                      to={`/rooms/${effectiveBooking.room.id}`}
                      data-testid="detail-view-room-btn"
                    >
                      Xem phòng làm việc
                    </Link>
                  </Button>
                )}
                <Button asChild className="sm:ml-auto">
                  <Link to="/rooms" data-testid="detail-back-home-btn">
                    Về danh sách phòng
                  </Link>
                </Button>
              </nav>
            </article>
          )}
      </div>
    </div>
  );
};
