import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { adminBookingApi } from '../services/admin-booking.api';
import { AdminBookingItem, AdminRevenueData } from '../types/admin-booking';
import { PaginationMeta } from '../types/room';
import { AdminGuestBookingForm } from '../components/AdminGuestBookingForm';
import { BookingFilters } from '../components/admin/bookings/BookingFilters';
import { RevenueSummary } from '../components/admin/bookings/RevenueSummary';
import {
  AdminBookingTable,
  AdminBookingTableSkeleton,
} from '../components/admin/bookings/AdminBookingTable';
import { ConfirmPaymentDialog } from '../components/admin/bookings/ConfirmPaymentDialog';
import { CancelBookingDialog } from '../components/admin/bookings/CancelBookingDialog';
import { useToast } from '../hooks/useToast';
import { CircleCheck, ClipboardList, RotateCw, X } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { Button } from '@/components/ui/button';

const PAGE_LIMIT = 10;
const VALID_STATUSES = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

const DEFAULT_PAGINATION: PaginationMeta = {
  page: 1,
  limit: PAGE_LIMIT,
  total: 0,
  totalPages: 0,
};

export const AdminBookingsPage: React.FC = () => {
  const { principal } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Guest booking form toggle
  const [isGuestFormOpen, setIsGuestFormOpen] = useState<boolean>(false);

  // Parse and normalize URL search parameters
  const {
    appliedCode,
    appliedDate,
    appliedStatus,
    currentPage,
    normalizedParams,
    hasParamDiscrepancy,
  } = useMemo(() => {
    const rawCode = searchParams.get('bookingCode');
    const rawDate = searchParams.get('date');
    const rawStatus = searchParams.get('status');
    const rawPage = searchParams.get('page');

    let code: string | undefined = undefined;
    if (rawCode) {
      const cleaned = rawCode.replace(/\s+/g, '').toUpperCase();
      if (cleaned.length > 0) code = cleaned;
    }

    let date: string | undefined = undefined;
    if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      date = rawDate;
    }

    let status: string | undefined = undefined;
    if (rawStatus && VALID_STATUSES.includes(rawStatus)) {
      status = rawStatus;
    }

    let page = 1;
    if (rawPage && /^[1-9]\d*$/.test(rawPage)) {
      const parsed = parseInt(rawPage, 10);
      if (parsed > 0 && parsed <= 1_000_000) {
        page = parsed;
      }
    }

    const nextParams = new URLSearchParams();
    if (code) nextParams.set('bookingCode', code);
    if (date) nextParams.set('date', date);
    if (status) nextParams.set('status', status);
    if (page > 1) nextParams.set('page', page.toString());

    const isDifferent = searchParams.toString() !== nextParams.toString();

    return {
      appliedCode: code,
      appliedDate: date,
      appliedStatus: status,
      currentPage: page,
      normalizedParams: nextParams,
      hasParamDiscrepancy: isDifferent,
    };
  }, [searchParams]);

  useEffect(() => {
    if (hasParamDiscrepancy) {
      setSearchParams(normalizedParams, { replace: true });
    }
  }, [hasParamDiscrepancy, normalizedParams, setSearchParams]);

  // Draft search form inputs
  const [draftCode, setDraftCode] = useState<string>(appliedCode || '');
  const [draftDate, setDraftDate] = useState<string>(appliedDate || '');
  const [draftStatus, setDraftStatus] = useState<string>(appliedStatus || '');

  // Keep draft in sync when URL changes (e.g. back/forward navigation)
  useEffect(() => {
    setDraftCode(appliedCode || '');
    setDraftDate(appliedDate || '');
    setDraftStatus(appliedStatus || '');
  }, [appliedCode, appliedDate, appliedStatus]);

  // Request & list state
  const [bookings, setBookings] = useState<AdminBookingItem[] | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [revenueData, setRevenueData] = useState<AdminRevenueData | null>(null);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [refreshIndex, setRefreshIndex] = useState<number>(0);

  // Payment confirmation modal state
  const [paymentModalTarget, setPaymentModalTarget] = useState<AdminBookingItem | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QR'>('CASH');
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Admin cancellation modal state
  const [cancelModalTarget, setCancelModalTarget] = useState<AdminBookingItem | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelValidationError, setCancelValidationError] = useState<string | null>(null);
  const [isCancelSubmitting, setIsCancelSubmitting] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Success message banner
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSessionUserRef = useRef<string | undefined>(principal?.id);
  activeSessionUserRef.current = principal?.id;
  const activeFilterKeyRef = useRef<string>('');

  const handleOpenPaymentModal = (booking: AdminBookingItem) => {
    setPaymentModalTarget(booking);
    setPaymentMethod('CASH');
    setPaymentError(null);
  };

  const handleClosePaymentModal = () => {
    setPaymentModalTarget(null);
    setPaymentError(null);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalTarget) return;

    setIsPaymentSubmitting(true);
    setPaymentError(null);
    try {
      const res = await adminBookingApi.confirmPayment(paymentModalTarget.id, {
        paymentMethod,
      });
      if (res.success) {
        showToast(
          `Xác nhận thanh toán thành công cho đơn ${paymentModalTarget.bookingCode}`,
          'success',
        );
        setActionSuccessMessage(
          `Xác nhận thanh toán thành công cho đơn ${paymentModalTarget.bookingCode}`,
        );
        setPaymentModalTarget(null);
        fetchAdminBookings();
      } else {
        const msg = res.message || 'Không thể xác nhận thanh toán.';
        setPaymentError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Không thể xác nhận thanh toán. Vui lòng thử lại.';
      setPaymentError(msg);
      showToast(msg, 'error');
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  const handleOpenCancelModal = (booking: AdminBookingItem) => {
    setCancelModalTarget(booking);
    setCancelReason('');
    setCancelValidationError(null);
    setCancelError(null);
  };

  const handleCloseCancelModal = () => {
    setCancelModalTarget(null);
    setCancelValidationError(null);
    setCancelError(null);
  };

  const handleSubmitCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalTarget) return;

    const trimmed = cancelReason.trim();
    if (!trimmed) {
      setCancelValidationError('Vui lòng nhập lý do hủy');
      return;
    }
    if (trimmed.length > 500) {
      setCancelValidationError('Lý do hủy không được vượt quá 500 ký tự');
      return;
    }

    setIsCancelSubmitting(true);
    setCancelError(null);
    try {
      const res = await adminBookingApi.cancelBooking(cancelModalTarget.id, {
        reason: trimmed,
      });
      if (res.success) {
        showToast(`Đã hủy đơn ${cancelModalTarget.bookingCode} thành công`, 'success');
        setActionSuccessMessage(`Đã hủy đơn ${cancelModalTarget.bookingCode} thành công`);
        setCancelModalTarget(null);
        fetchAdminBookings();
      } else {
        const msg = res.message || 'Không thể hủy đơn đặt phòng.';
        setCancelError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Không thể hủy đơn đặt phòng. Vui lòng thử lại.';
      setCancelError(msg);
      showToast(msg, 'error');
    } finally {
      setIsCancelSubmitting(false);
    }
  };

  const handleCompleteBooking = async (booking: AdminBookingItem) => {
    try {
      const res = await adminBookingApi.completeBooking(booking.id);
      if (res.success) {
        showToast(`Đã hoàn tất ca cho đơn ${booking.bookingCode}`, 'success');
        setActionSuccessMessage(`Đã hoàn tất ca cho đơn ${booking.bookingCode}`);
        setRefreshIndex((prev) => prev + 1);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Không thể hoàn tất đơn đặt phòng. Vui lòng thử lại.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    }
  };

  const handleMarkNoShow = async (booking: AdminBookingItem) => {
    try {
      const res = await adminBookingApi.markNoShow(booking.id);
      if (res.success) {
        showToast(`Đã đánh dấu không đến cho đơn ${booking.bookingCode}`, 'success');
        setActionSuccessMessage(`Đã đánh dấu không đến cho đơn ${booking.bookingCode}`);
        setRefreshIndex((prev) => prev + 1);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Không thể đánh dấu khách không đến. Vui lòng thử lại.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    }
  };

  const fetchAdminBookings = useCallback(() => {
    const currentRequestId = ++requestIdRef.current;
    const requestingUser = principal?.id;
    const requestFilterKey = `${appliedCode}|${appliedDate}|${appliedStatus}|${currentPage}|${requestingUser}`;
    activeFilterKeyRef.current = requestFilterKey;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setErrorMessage(null);
    setRevenueError(null);

    adminBookingApi
      .getRevenue(
        {
          startDate: appliedDate,
          endDate: appliedDate,
        },
        controller.signal,
      )
      .then((revRes) => {
        if (!controller.signal.aborted) {
          if (revRes.success) {
            setRevenueData(revRes.data);
          } else {
            setRevenueError(revRes.message || 'Không thể tải dữ liệu doanh thu.');
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error('Không thể tải dữ liệu doanh thu', err);
          setRevenueError(
            err.response?.data?.message || 'Không thể tải dữ liệu doanh thu. Vui lòng thử lại.',
          );
        }
      });

    adminBookingApi
      .getBookings(
        {
          page: currentPage,
          limit: PAGE_LIMIT,
          bookingCode: appliedCode,
          date: appliedDate,
          status: appliedStatus,
        },
        controller.signal,
      )
      .then((res) => {
        if (
          controller.signal.aborted ||
          requestIdRef.current !== currentRequestId ||
          activeSessionUserRef.current !== requestingUser ||
          activeFilterKeyRef.current !== requestFilterKey
        ) {
          return;
        }

        if (res.success) {
          setBookings(res.data.items);
          setPagination(res.data.pagination);
          setIsLoading(false);
        } else {
          setErrorMessage(res.message || 'Không thể tải danh sách đặt phòng.');
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (
          controller.signal.aborted ||
          requestIdRef.current !== currentRequestId ||
          activeSessionUserRef.current !== requestingUser ||
          activeFilterKeyRef.current !== requestFilterKey
        ) {
          return;
        }

        setErrorMessage(
          err.response?.data?.message || 'Không thể tải danh sách đặt phòng. Vui lòng thử lại.',
        );
        setIsLoading(false);
      });
  }, [currentPage, appliedCode, appliedDate, appliedStatus, principal?.id]);

  useEffect(() => {
    fetchAdminBookings();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchAdminBookings, refreshIndex]);

  // Handle filter submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextParams = new URLSearchParams();
    const cleanedCode = draftCode.replace(/\s+/g, '').toUpperCase();
    if (cleanedCode) nextParams.set('bookingCode', cleanedCode);
    if (draftDate) nextParams.set('date', draftDate);
    if (draftStatus) nextParams.set('status', draftStatus);
    // Reset to page 1 on filter submit
    setSearchParams(nextParams);
  };

  // Handle clearing all filters
  const handleClearFilters = () => {
    setDraftCode('');
    setDraftDate('');
    setDraftStatus('');
    setSearchParams(new URLSearchParams());
  };

  // Handle pagination navigation
  const handlePageChange = (newPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    if (newPage > 1) {
      nextParams.set('page', newPage.toString());
    } else {
      nextParams.delete('page');
    }
    setSearchParams(nextParams);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:gap-8">
      <PageHeader
        eyebrow="Đặt phòng"
        title="Quản Lý Đặt Phòng"
        description="Theo dõi danh sách đặt phòng, cập nhật trạng thái thanh toán và tạo đơn khách vãng lai"
        className="gap-4 border-border pb-5"
      />

      {/* Action Success Alert Banner */}
      {actionSuccessMessage && (
        <div
          role="alert"
          data-testid="admin-action-success-banner"
          className="flex animate-rise items-start gap-3 rounded-lg border border-status-success-border bg-status-success-bg px-4 py-3 text-sm text-status-success"
        >
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1 font-medium">{actionSuccessMessage}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-current hover:bg-card/60"
            aria-label="Đóng thông báo"
            onClick={() => setActionSuccessMessage(null)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Guest Booking Form Section */}
      <AdminGuestBookingForm
        key={principal?.id || 'guest-booking-form'}
        principalId={principal?.id}
        isOpen={isGuestFormOpen}
        onToggleOpen={() => setIsGuestFormOpen((prev) => !prev)}
        onBookingCreated={() => {
          setRefreshIndex((prev) => prev + 1);
        }}
      />

      {/* Filter and Search Section */}
      <BookingFilters
        code={draftCode}
        date={draftDate}
        status={draftStatus}
        onCodeChange={setDraftCode}
        onDateChange={setDraftDate}
        onStatusChange={setDraftStatus}
        onSubmit={handleSearchSubmit}
        onClear={handleClearFilters}
      />

      {/* Revenue KPI Summary */}
      <RevenueSummary data={revenueData} error={revenueError} />

      {/* Booking List Table Section */}
      <section
        aria-labelledby="admin-bookings-title"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="admin-bookings-title" className="text-h3">
            Danh sách đơn đặt phòng{' '}
            <span
              className="text-sm font-medium text-muted-foreground tabular-nums"
              data-testid="total-bookings-count"
            >
              ({pagination.total} đơn)
            </span>
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchAdminBookings}
            data-testid="refresh-bookings-btn"
          >
            <RotateCw aria-hidden="true" />
            Tải lại
          </Button>
        </div>

        {/* Loading State with Table Skeletons */}
        {isLoading && <AdminBookingTableSkeleton />}

        {/* Error State */}
        {!isLoading && errorMessage && (
          <ErrorState
            data-testid="admin-bookings-error"
            title={errorMessage}
            onRetry={fetchAdminBookings}
          />
        )}

        {/* Empty State */}
        {!isLoading && !errorMessage && (!bookings || bookings.length === 0) && (
          <EmptyState
            data-testid="admin-bookings-empty"
            icon={ClipboardList}
            title="Không tìm thấy đơn đặt phòng"
            description="Không có đơn nào khớp với tiêu chí tìm kiếm hiện tại. Hãy thử thay đổi hoặc xóa bộ lọc."
          />
        )}

        {/* Bookings Table */}
        {!isLoading && !errorMessage && bookings && bookings.length > 0 && (
          <>
            <AdminBookingTable
              bookings={bookings}
              onConfirmPayment={handleOpenPaymentModal}
              onComplete={handleCompleteBooking}
              onNoShow={handleMarkNoShow}
              onCancel={handleOpenCancelModal}
            />

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={handlePageChange}
                testId="admin-bookings-pagination"
                prevTestId="pagination-prev-btn"
                nextTestId="pagination-next-btn"
                infoTestId="pagination-info"
              />
            )}
          </>
        )}
      </section>

      {/* Confirm Payment Modal */}
      <ConfirmPaymentDialog
        booking={paymentModalTarget}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        isSubmitting={isPaymentSubmitting}
        error={paymentError}
        onSubmit={handleSubmitPayment}
        onClose={handleClosePaymentModal}
      />

      {/* Admin Cancel Modal */}
      <CancelBookingDialog
        booking={cancelModalTarget}
        reason={cancelReason}
        onReasonChange={(value) => {
          setCancelReason(value);
          if (cancelValidationError) setCancelValidationError(null);
        }}
        validationError={cancelValidationError}
        isSubmitting={isCancelSubmitting}
        error={cancelError}
        onSubmit={handleSubmitCancel}
        onClose={handleCloseCancelModal}
      />
    </div>
  );
};
