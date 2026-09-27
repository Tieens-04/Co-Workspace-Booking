import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { bookingApi } from '../services/booking.api';
import { BookingResult, BookingHistoryView } from '../types/booking';
import { PaginationMeta } from '../types/room';
import { BookingSummary } from '../components/BookingSummary';

const PAGE_LIMIT = 10;
const VALID_VIEWS: BookingHistoryView[] = ['ALL', 'UPCOMING', 'COMPLETED'];

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
  const { principal, logout } = useAuth();
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

  return (
    <main className="page-container booking-history-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h1>🏢 Co-Space Working</h1>
          </Link>
          <p>Lịch sử đặt phòng của bạn</p>
        </div>

        <nav className="nav-actions">
          {principal && (
            <span className="user-status-text">
              Xin chào, <strong>{principal.fullName || principal.email || principal.id}</strong>{' '}
              <span className="badge badge-customer">CUSTOMER</span>
            </span>
          )}
          <Link to="/" className="btn btn-outline">
            Danh sách phòng
          </Link>
          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={() => logout('userAction')}
          >
            Đăng xuất
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <div className="history-content-layout">
        <div className="history-header-row">
          <h2 className="page-heading">📋 Lịch sử đặt phòng</h2>

          {/* View Filter Tabs */}
          <div
            className="history-filter-tabs"
            role="group"
            aria-label="Bộ lọc trạng thái đơn đặt phòng"
          >
            <button
              type="button"
              className={`history-filter-btn ${currentView === 'ALL' ? 'active' : ''}`}
              onClick={() => handleViewChange('ALL')}
              aria-pressed={currentView === 'ALL'}
            >
              Tất cả
            </button>
            <button
              type="button"
              className={`history-filter-btn ${currentView === 'UPCOMING' ? 'active' : ''}`}
              onClick={() => handleViewChange('UPCOMING')}
              aria-pressed={currentView === 'UPCOMING'}
            >
              Sắp tới
            </button>
            <button
              type="button"
              className={`history-filter-btn ${currentView === 'COMPLETED' ? 'active' : ''}`}
              onClick={() => handleViewChange('COMPLETED')}
              aria-pressed={currentView === 'COMPLETED'}
            >
              Đã hoàn tất
            </button>
          </div>
        </div>

        {/* Loading State */}
        {effectiveIsLoading && (
          <div
            className="booking-list-loading"
            role="status"
            aria-busy="true"
            aria-label="Đang tải lịch sử đặt phòng"
          >
            {[1, 2, 3].map((n) => (
              <div key={n} className="card booking-item-card skeleton-card">
                <div className="skeleton skeleton-title" style={{ width: '40%' }} />
                <div className="skeleton skeleton-text" style={{ width: '70%' }} />
                <div className="skeleton skeleton-text" style={{ width: '50%' }} />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!effectiveIsLoading && effectiveErrorMessage && (
          <div className="card error-state-card" role="alert">
            <div className="state-icon" aria-hidden="true">
              ⚠️
            </div>
            <h3 className="error-title">Không thể tải lịch sử đặt phòng</h3>
            <p className="error-description">{effectiveErrorMessage}</p>
            <button type="button" className="btn btn-primary" onClick={fetchHistory}>
              Thử lại
            </button>
          </div>
        )}

        {/* Empty State */}
        {!effectiveIsLoading &&
          !effectiveErrorMessage &&
          effectiveBookings &&
          effectiveBookings.length === 0 && (
            <div className="card empty-state-card" data-testid="booking-history-empty">
              <div className="state-icon" aria-hidden="true">
                📅
              </div>
              <h3 className="empty-title">{getEmptyMessage()}</h3>
              <p className="empty-description">
                {effectivePagination.total > 0 && currentPage > effectivePagination.totalPages
                  ? 'Bạn đang ở trang vượt quá số trang hiện có. Vui lòng quay lại trang đầu tiên.'
                  : 'Bạn có thể khám phá danh sách không gian làm việc và thực hiện đặt phòng mới bất cứ lúc nào.'}
              </p>
              <div className="empty-actions">
                {effectivePagination.total > 0 && currentPage > effectivePagination.totalPages ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handlePageChange(1)}
                  >
                    Về trang 1
                  </button>
                ) : (
                  <Link to="/" className="btn btn-primary">
                    Khám phá phòng ngay
                  </Link>
                )}
              </div>
            </div>
          )}

        {/* Booking Cards List */}
        {!effectiveIsLoading &&
          !effectiveErrorMessage &&
          effectiveBookings &&
          effectiveBookings.length > 0 && (
            <>
              <div
                className="booking-history-list"
                aria-label="Danh sách đơn đặt phòng"
                data-testid="booking-history-list"
              >
                {effectiveBookings.map((booking) => (
                  <article
                    key={booking.id}
                    className="card booking-item-card"
                    data-testid={`booking-item-${booking.id}`}
                  >
                    <div className="booking-item-body">
                      <BookingSummary booking={booking} />
                    </div>
                    <div className="booking-item-actions">
                      <Link
                        to={`/bookings/${booking.id}`}
                        className="btn btn-outline booking-detail-link"
                        aria-label={`Xem chi tiết đơn ${booking.bookingCode}`}
                        data-testid={`view-detail-${booking.id}`}
                      >
                        Xem chi tiết →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>

              {/* Pagination Controls */}
              {effectivePagination.totalPages > 1 && (
                <nav className="pagination-container" aria-label="Điều hướng phân trang lịch sử">
                  <button
                    type="button"
                    className="btn btn-outline pagination-btn"
                    disabled={effectivePagination.page <= 1}
                    onClick={() => handlePageChange(effectivePagination.page - 1)}
                    aria-label="Trang trước"
                  >
                    ← Trang trước
                  </button>

                  <span className="pagination-info">
                    Trang <strong>{effectivePagination.page}</strong> /{' '}
                    {effectivePagination.totalPages} (Tổng {effectivePagination.total} đơn)
                  </span>

                  <button
                    type="button"
                    className="btn btn-outline pagination-btn"
                    disabled={effectivePagination.page >= effectivePagination.totalPages}
                    onClick={() => handlePageChange(effectivePagination.page + 1)}
                    aria-label="Trang sau"
                  >
                    Trang sau →
                  </button>
                </nav>
              )}
            </>
          )}
      </div>

      <footer className="app-footer">
        Co-Space Working Platform — Hệ thống đặt chỗ làm việc thông minh.
      </footer>
    </main>
  );
};
