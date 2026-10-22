import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { bookingApi } from '../services/booking.api';
import { BookingResult, BookingHistoryView } from '../types/booking';
import { PaginationMeta } from '../types/room';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '../components/common/PageHeader';
import { SegmentedControl, type SegmentedOption } from '../components/common/SegmentedControl';
import { EmptyState, ErrorState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { BookingHistoryRow } from '../components/booking/BookingHistoryRow';
import { Stagger, StaggerItem } from '../components/motion/Stagger';

const PAGE_LIMIT = 10;
const VALID_VIEWS: BookingHistoryView[] = ['ALL', 'UPCOMING', 'COMPLETED'];

const VIEW_OPTIONS: SegmentedOption<BookingHistoryView>[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'UPCOMING', label: 'Sắp tới' },
  { value: 'COMPLETED', label: 'Đã hoàn tất' },
];

interface BookingHistoryState {
  sessionUserId: string | undefined;
  requestKey: string;
  bookings: BookingResult[] | null;
  pagination: PaginationMeta;
  isLoading: boolean;
  errorMessage: string | null;
}

const DEFAULT_PAGINATION: PaginationMeta = {
  page: 1,
  limit: PAGE_LIMIT,
  total: 0,
  totalPages: 0,
};

export const BookingHistoryPage: React.FC = () => {
  const { principal } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Normalize URL parameters
  const { currentView, currentPage, hasParamDiscrepancy, normalizedParams } = useMemo(() => {
    const rawView = searchParams.get('view');
    const rawPage = searchParams.get('page');

    let view: BookingHistoryView = 'ALL';
    if (rawView && VALID_VIEWS.includes(rawView as BookingHistoryView)) {
      view = rawView as BookingHistoryView;
    }

    let page = 1;
    if (rawPage && /^[1-9]\d*$/.test(rawPage)) {
      const parsed = parseInt(rawPage, 10);
      if (parsed > 0 && parsed <= 1_000_000) {
        page = parsed;
      }
    }

    const nextParams = new URLSearchParams();
    if (view !== 'ALL') {
      nextParams.set('view', view);
    }
    if (page > 1) {
      nextParams.set('page', page.toString());
    }

    const isDifferent = searchParams.toString() !== nextParams.toString();

    return {
      currentView: view,
      currentPage: page,
      hasParamDiscrepancy: isDifferent,
      normalizedParams: nextParams,
    };
  }, [searchParams]);

  // Sync normalized params to URL if necessary
  useEffect(() => {
    if (hasParamDiscrepancy) {
      setSearchParams(normalizedParams, { replace: true });
    }
  }, [hasParamDiscrepancy, normalizedParams, setSearchParams]);

  const currentRequestKey = `${currentView}:${currentPage}`;

  // Session-bound state
  const [state, setState] = useState<BookingHistoryState>(() => ({
    sessionUserId: principal?.id,
    requestKey: currentRequestKey,
    bookings: null,
    pagination: DEFAULT_PAGINATION,
    isLoading: true,
    errorMessage: null,
  }));

  // Synchronously reset state if session changes during render before painting DOM
  if (state.sessionUserId !== principal?.id) {
    setState({
      sessionUserId: principal?.id,
      requestKey: currentRequestKey,
      bookings: null,
      pagination: DEFAULT_PAGINATION,
      isLoading: true,
      errorMessage: null,
    });
  }

  const isCurrentSession = state.sessionUserId === principal?.id;
  const isCurrentRequest = isCurrentSession && state.requestKey === currentRequestKey;

  const effectiveBookings = isCurrentRequest ? state.bookings : null;
  const effectivePagination = isCurrentRequest ? state.pagination : DEFAULT_PAGINATION;
  const effectiveIsLoading = !isCurrentRequest || state.isLoading;
  const effectiveErrorMessage = isCurrentRequest ? state.errorMessage : null;

  // Stale request guards
  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSessionUserRef = useRef<string | undefined>(principal?.id);
  activeSessionUserRef.current = principal?.id;

  const fetchHistory = useCallback(() => {
    const currentRequestId = ++requestIdRef.current;
    const requestingUser = principal?.id;
    const targetView = currentView;
    const targetPage = currentPage;
    const requestKey = `${targetView}:${targetPage}`;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((prev) => ({
      ...prev,
      sessionUserId: requestingUser,
      requestKey,
      isLoading: true,
      errorMessage: null,
    }));

    bookingApi
      .getBookings(
        {
          view: targetView,
          page: targetPage,
          limit: PAGE_LIMIT,
        },
        controller.signal,
      )
      .then((res) => {
        // Discard response if aborted, request is stale, or session changed
        if (
          controller.signal.aborted ||
          requestIdRef.current !== currentRequestId ||
          activeSessionUserRef.current !== requestingUser
        ) {
          return;
        }

        setState({
          sessionUserId: requestingUser,
          requestKey,
          bookings: res.data.items,
          pagination: res.data.pagination,
          isLoading: false,
          errorMessage: null,
        });
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

        setState((prev) => ({
          ...prev,
          sessionUserId: requestingUser,
          requestKey,
          isLoading: false,
          errorMessage:
            err.response?.data?.message || err.message || 'Không thể tải lịch sử đặt phòng',
        }));
      });
  }, [currentView, currentPage, principal?.id]);

  useEffect(() => {
    fetchHistory();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchHistory]);

  // Handlers
  const handleViewChange = (newView: BookingHistoryView) => {
    if (newView === currentView) return;
    const nextParams = new URLSearchParams(searchParams);
    if (newView === 'ALL') {
      nextParams.delete('view');
    } else {
      nextParams.set('view', newView);
    }
    // Reset to page 1 on view change
    nextParams.delete('page');
    setSearchParams(nextParams);
  };

  const handlePageChange = (newPage: number) => {
    if (
      newPage < 1 ||
      (effectivePagination.totalPages > 0 && newPage > effectivePagination.totalPages)
    ) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    if (newPage === 1) {
      nextParams.delete('page');
    } else {
      nextParams.set('page', newPage.toString());
    }
    setSearchParams(nextParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getEmptyMessage = () => {
    if (effectivePagination.total > 0 && currentPage > effectivePagination.totalPages) {
      return 'Trang này không có dữ liệu đặt phòng.';
    }
    switch (currentView) {
      case 'UPCOMING':
        return 'Không có đơn đặt phòng nào sắp tới.';
      case 'COMPLETED':
        return 'Chưa có đơn đặt phòng nào đã hoàn tất.';
      case 'ALL':
      default:
        return 'Bạn chưa có đơn đặt phòng nào.';
    }
  };

  const isPageOutOfRange =
    effectivePagination.total > 0 && currentPage > effectivePagination.totalPages;

  return (
    <div className="container-page py-10 md:py-14">
      <PageHeader
        eyebrow="Tài khoản của bạn"
        title="Lịch sử đặt phòng"
        description="Quản lý và theo dõi các đơn đặt phòng làm việc của bạn"
        size="display"
        actions={
          <Button asChild variant="outline">
            <Link to="/rooms">
              Đặt phòng mới
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <SegmentedControl
          ariaLabel="Bộ lọc trạng thái đơn đặt phòng"
          options={VIEW_OPTIONS}
          value={currentView}
          onChange={handleViewChange}
        />
        <p className="text-sm text-muted-foreground tabular-nums">
          {!effectiveIsLoading && !effectiveErrorMessage && effectivePagination.total > 0 && (
            <>
              <strong className="font-semibold text-foreground">{effectivePagination.total}</strong>{' '}
              đơn đặt phòng ·{' '}
            </>
          )}
          Giờ Việt Nam (UTC+7)
        </p>
      </div>

      <div className="mt-6">
        {/* Loading State */}
        {effectiveIsLoading && (
          <div
            className="divide-y border-y"
            role="status"
            aria-busy="true"
            aria-label="Đang tải lịch sử đặt phòng"
          >
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="grid gap-3 py-6 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1.25fr)_minmax(8.5rem,auto)_auto] md:items-center md:gap-8"
              >
                <div className="grid gap-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-5 w-3/4" />
                </div>
                <div className="grid gap-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="grid gap-2 md:justify-items-end">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <Skeleton className="h-9 w-28 rounded-md" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!effectiveIsLoading && effectiveErrorMessage && (
          <ErrorState
            title="Không thể tải lịch sử đặt phòng"
            description={effectiveErrorMessage}
            onRetry={fetchHistory}
          />
        )}

        {/* Empty State */}
        {!effectiveIsLoading &&
          !effectiveErrorMessage &&
          effectiveBookings &&
          effectiveBookings.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              data-testid="booking-history-empty"
              title={getEmptyMessage()}
              description={
                isPageOutOfRange
                  ? 'Bạn đang ở trang vượt quá số trang hiện có. Vui lòng quay lại trang đầu tiên.'
                  : 'Bạn có thể khám phá danh sách không gian làm việc và thực hiện đặt phòng mới bất cứ lúc nào.'
              }
              action={
                isPageOutOfRange ? (
                  <Button type="button" size="sm" onClick={() => handlePageChange(1)}>
                    Về trang 1
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link to="/rooms">
                      Khám phá phòng ngay
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                )
              }
            />
          )}

        {/* Booking Rows List */}
        {!effectiveIsLoading &&
          !effectiveErrorMessage &&
          effectiveBookings &&
          effectiveBookings.length > 0 && (
            <>
              <Stagger
                // Replays when the filter or page changes so the new list reads as new.
                key={`${effectivePagination.page}-${effectiveBookings[0]?.id ?? ''}`}
                stagger={0.04}
                className="divide-y border-y"
                aria-label="Danh sách đơn đặt phòng"
                data-testid="booking-history-list"
              >
                {effectiveBookings.map((booking) => (
                  <StaggerItem key={booking.id}>
                    <BookingHistoryRow booking={booking} />
                  </StaggerItem>
                ))}
              </Stagger>

              {/* Pagination Controls */}
              {effectivePagination.totalPages > 1 && (
                <Pagination
                  className="mt-6 border-t-0 pt-0"
                  ariaLabel="Điều hướng phân trang lịch sử"
                  page={effectivePagination.page}
                  totalPages={effectivePagination.totalPages}
                  onPageChange={handlePageChange}
                  info={
                    <>
                      Trang <strong className="text-foreground">{effectivePagination.page}</strong>{' '}
                      / {effectivePagination.totalPages} (Tổng {effectivePagination.total} đơn)
                    </>
                  }
                />
              )}
            </>
          )}
      </div>
    </div>
  );
};
