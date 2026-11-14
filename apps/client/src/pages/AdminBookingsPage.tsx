import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { adminBookingApi } from '../services/admin-booking.api';
import { AdminBookingItem, AdminRevenueData } from '../types/admin-booking';
import { PaginationMeta } from '../types/room';
import { AdminGuestBookingForm } from '../components/AdminGuestBookingForm';
import { BookingFilters } from '../components/admin/bookings/BookingFilters';
import { RevenueSummary } from '../components/admin/bookings/RevenueSummary';
import { ReportExport } from '../components/admin/bookings/ReportExport';
import {
  AdminBookingTable,
  AdminBookingTableSkeleton,
} from '../components/admin/bookings/AdminBookingTable';
import { ConfirmPaymentDialog } from '../components/admin/bookings/ConfirmPaymentDialog';
import { CancelBookingDialog } from '../components/admin/bookings/CancelBookingDialog';
import {
  RefundBookingDialog,
  RefundBookingSubmitData,
} from '../components/admin/bookings/RefundBookingDialog';
import {
  LifecycleConfirmDialog,
  LifecycleConfirmTarget,
} from '../components/admin/bookings/LifecycleConfirmDialog';
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
    appliedCustomer,
    appliedDate,
    appliedStatus,
    appliedNeedsAttention,
    currentPage,
    normalizedParams,
    hasParamDiscrepancy,
  } = useMemo(() => {
    const rawCode = searchParams.get('bookingCode');
    const rawCustomer = searchParams.get('customer');
    const rawDate = searchParams.get('date');
    const rawStatus = searchParams.get('status');
    const rawNeedsAttention = searchParams.get('needsAttention');
    const rawPage = searchParams.get('page');

    let code: string | undefined = undefined;
    if (rawCode) {
      const cleaned = rawCode.replace(/\s+/g, '').toUpperCase();
      if (cleaned.length > 0) code = cleaned;
    }

    let customer: string | undefined = undefined;
    if (rawCustomer) {
      const cleaned = rawCustomer.trim().slice(0, 191);
      if (cleaned.length > 0) customer = cleaned;
    }

    let date: string | undefined = undefined;
    if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      date = rawDate;
    }

    let status: string | undefined = undefined;
    if (rawStatus && VALID_STATUSES.includes(rawStatus)) {
      status = rawStatus;
    }

    const needsAttention = rawNeedsAttention === 'true' ? true : undefined;

    let page = 1;
    if (rawPage && /^[1-9]\d*$/.test(rawPage)) {
      const parsed = parseInt(rawPage, 10);
      if (parsed > 0 && parsed <= 1_000_000) {
        page = parsed;
      }
    }

    const nextParams = new URLSearchParams();
    if (code) nextParams.set('bookingCode', code);
    if (customer) nextParams.set('customer', customer);
    if (date) nextParams.set('date', date);
    if (status) nextParams.set('status', status);
    if (needsAttention) nextParams.set('needsAttention', 'true');
    if (page > 1) nextParams.set('page', page.toString());

    const isDifferent = searchParams.toString() !== nextParams.toString();

    return {
      appliedCode: code,
      appliedCustomer: customer,
      appliedDate: date,
      appliedStatus: status,
      appliedNeedsAttention: needsAttention,
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
  const [draftCustomer, setDraftCustomer] = useState<string>(appliedCustomer || '');
  const [draftDate, setDraftDate] = useState<string>(appliedDate || '');
  const [draftStatus, setDraftStatus] = useState<string>(appliedStatus || '');
  const [draftNeedsAttention, setDraftNeedsAttention] = useState<boolean>(
    Boolean(appliedNeedsAttention),
  );

  // Keep draft in sync when URL changes (e.g. back/forward navigation)
  useEffect(() => {
    setDraftCode(appliedCode || '');
    setDraftCustomer(appliedCustomer || '');
    setDraftDate(appliedDate || '');
    setDraftStatus(appliedStatus || '');
    setDraftNeedsAttention(Boolean(appliedNeedsAttention));
  }, [appliedCode, appliedCustomer, appliedDate, appliedStatus, appliedNeedsAttention]);

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
  // Refund modal state (CWB-83)
  const [refundModalTarget, setRefundModalTarget] = useState<AdminBookingItem | null>(null);
  const [isRefundSubmitting, setIsRefundSubmitting] = useState<boolean>(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  // Success message banner
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const pendingActionRef = useRef(false);

  // Complete / no-show require an explicit confirmation step
  const [lifecycleTarget, setLifecycleTarget] = useState<LifecycleConfirmTarget | null>(null);

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

  const handleOpenRefundModal = (booking: AdminBookingItem) => {
    if (pendingActionRef.current) return;
    setRefundModalTarget(booking);
    setRefundError(null);
  };

  const handleCloseRefundModal = () => {
    if (isRefundSubmitting) return;
    setRefundModalTarget(null);
    setRefundError(null);
  };

  const handleSubmitRefund = async (data: RefundBookingSubmitData) => {
    if (!refundModalTarget || pendingActionRef.current || isRefundSubmitting) return;
    pendingActionRef.current = true;
    setPendingBookingId(refundModalTarget.id);
    setIsRefundSubmitting(true);
    setRefundError(null);
    setActionErrorMessage(null);
    setActionSuccessMessage(null);
    try {
      const res = await adminBookingApi.recordRefund(refundModalTarget.id, data);
      if (!res.success) {
        const msg = res.message || 'Không thể ghi nhận hoàn tiền. Vui lòng thử lại.';
        setRefundError(msg);
        showToast(msg, 'error');
        return;
      }
      const msg = `Đã ghi nhận hoàn tiền cho đơn ${refundModalTarget.bookingCode}`;
      showToast(msg, 'success');
      setActionSuccessMessage(msg);
      setRefundModalTarget(null);
      fetchAdminBookings(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Không thể ghi nhận hoàn tiền. Vui lòng thử lại.';
      setRefundError(msg);
      showToast(msg, 'error');
      if (err.response?.status === 409) {
        fetchAdminBookings(true);
      }
    } finally {
      setIsRefundSubmitting(false);
      pendingActionRef.current = false;
      setPendingBookingId(null);
    }
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
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    setPendingBookingId(booking.id);
    setActionErrorMessage(null);
    setActionSuccessMessage(null);
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
      setActionErrorMessage(msg);
      showToast(msg, 'error');
      if (err.response?.status === 409) fetchAdminBookings(true);
    } finally {
      pendingActionRef.current = false;
      setPendingBookingId(null);
    }
  };

  const handleMarkNoShow = async (booking: AdminBookingItem) => {
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    setPendingBookingId(booking.id);
    setActionErrorMessage(null);
    setActionSuccessMessage(null);
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
      setActionErrorMessage(msg);
      showToast(msg, 'error');
      if (err.response?.status === 409) fetchAdminBookings(true);
    } finally {
      pendingActionRef.current = false;
      setPendingBookingId(null);
    }
  };

  const handleRequestLifecycle = (
    booking: AdminBookingItem,
    action: LifecycleConfirmTarget['action'],
  ) => {
    if (pendingActionRef.current) return;
    setLifecycleTarget({ booking, action });
  };

  const handleConfirmLifecycle = async () => {
    if (!lifecycleTarget || pendingActionRef.current) return;
    const { booking, action } = lifecycleTarget;
    if (action === 'complete') {
      await handleCompleteBooking(booking);
    } else {
      await handleMarkNoShow(booking);
    }
    // Outcome (success, 409 refresh, retryable error) is reported on the page.
    setLifecycleTarget(null);
  };

  const handleCheckIn = async (booking: AdminBookingItem) => {
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    setPendingBookingId(booking.id);
    setActionErrorMessage(null);
    setActionSuccessMessage(null);
    try {
      const res = await adminBookingApi.checkInBooking(booking.id);
      if (!res.success) {
        const message = res.message || 'Không thể check-in. Vui lòng thử lại.';
        setActionErrorMessage(message);
        showToast(message, 'error');
        return;
      }
      const message = `Đã check-in cho đơn ${booking.bookingCode}`;
      setBookings(
        (previous) => previous?.map((item) => (item.id === booking.id ? res.data : item)) ?? null,
      );
      setActionSuccessMessage(message);
      showToast(message, 'success');
      fetchAdminBookings(true);
    } catch (err: any) {
      const message = err.response?.data?.message || 'Không thể check-in. Vui lòng thử lại.';
      setActionErrorMessage(message);
      showToast(message, 'error');
      if (err.response?.status === 409) fetchAdminBookings(true);
    } finally {
      pendingActionRef.current = false;
      setPendingBookingId(null);
    }
  };

  const fetchAdminBookings = useCallback(
    (preserveList = false) => {
      const currentRequestId = ++requestIdRef.current;
      const requestingUser = principal?.id;
      const requestFilterKey = `${appliedCode}|${appliedCustomer}|${appliedDate}|${appliedStatus}|${appliedNeedsAttention ? '1' : '0'}|${currentPage}|${requestingUser}`;
      activeFilterKeyRef.current = requestFilterKey;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (!preserveList) setIsLoading(true);
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
            customer: appliedCustomer,
            date: appliedDate,
            status: appliedStatus,
            ...(appliedNeedsAttention ? { needsAttention: true } : {}),
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
            const msg = res.message || 'Không thể tải danh sách đặt phòng.';
            if (preserveList)
              setActionErrorMessage((previous) => `${previous || ''} ${msg}`.trim());
            else setErrorMessage(msg);
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

          const msg =
            err.response?.data?.message || 'Không thể tải danh sách đặt phòng. Vui lòng thử lại.';
          if (preserveList) setActionErrorMessage((previous) => `${previous || ''} ${msg}`.trim());
          else setErrorMessage(msg);
          setIsLoading(false);
        });
    },
    [
      currentPage,
      appliedCode,
      appliedCustomer,
      appliedDate,
      appliedStatus,
      appliedNeedsAttention,
      principal?.id,
    ],
  );

  useEffect(() => {
    fetchAdminBookings();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchAdminBookings, refreshIndex]);

  const applyDraftFiltersToParams = (needsAttentionValue: boolean) => {
    const nextParams = new URLSearchParams();
    const cleanedCode = draftCode.replace(/\s+/g, '').toUpperCase();
    if (cleanedCode) nextParams.set('bookingCode', cleanedCode);
    const cleanedCustomer = draftCustomer.trim().slice(0, 191);
    if (cleanedCustomer) nextParams.set('customer', cleanedCustomer);
    if (draftDate) nextParams.set('date', draftDate);
    if (draftStatus) nextParams.set('status', draftStatus);
    if (needsAttentionValue) nextParams.set('needsAttention', 'true');
    // Reset to page 1 on filter change
    setSearchParams(nextParams);
  };

  // Handle filter submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyDraftFiltersToParams(draftNeedsAttention);
  };

  // Toggle needsAttention immediately while preserving current draft filter inputs
  const handleNeedsAttentionChange = (checked: boolean) => {
    setDraftNeedsAttention(checked);
    applyDraftFiltersToParams(checked);
  };

  // Handle clearing all filters
  const handleClearFilters = () => {
    setDraftCode('');
    setDraftCustomer('');
    setDraftDate('');
    setDraftStatus('');
    setDraftNeedsAttention(false);
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
      {actionErrorMessage && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {actionErrorMessage}
        </p>
      )}
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
        customer={draftCustomer}
        date={draftDate}
        status={draftStatus}
        needsAttention={draftNeedsAttention}
        onCodeChange={setDraftCode}
        onCustomerChange={setDraftCustomer}
        onDateChange={setDraftDate}
        onStatusChange={setDraftStatus}
        onNeedsAttentionChange={handleNeedsAttentionChange}
        onSubmit={handleSearchSubmit}
        onClear={handleClearFilters}
      />

      {/* Revenue KPI Summary */}
      <RevenueSummary data={revenueData} error={revenueError} />

      {/* CSV export (CWB-69) */}
      <ReportExport />

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
            onClick={() => fetchAdminBookings()}
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
              onComplete={(booking) => handleRequestLifecycle(booking, 'complete')}
              onNoShow={(booking) => handleRequestLifecycle(booking, 'no-show')}
              onCancel={handleOpenCancelModal}
              onCheckIn={handleCheckIn}
              onRefund={handleOpenRefundModal}
              pendingBookingId={pendingBookingId}
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

      {/* Refund Modal (CWB-83) */}
      <RefundBookingDialog
        booking={refundModalTarget}
        isSubmitting={isRefundSubmitting}
        error={refundError}
        onClose={handleCloseRefundModal}
        onSubmit={handleSubmitRefund}
      />

      {/* Complete / No-show confirmation */}
      <LifecycleConfirmDialog
        target={lifecycleTarget}
        isSubmitting={lifecycleTarget !== null && pendingBookingId === lifecycleTarget.booking.id}
        onConfirm={handleConfirmLifecycle}
        onClose={() => setLifecycleTarget(null)}
      />
    </div>
  );
};
