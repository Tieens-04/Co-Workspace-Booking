import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { adminBookingApi } from '../services/admin-booking.api';
import { AdminBookingItem, AdminRevenueData } from '../types/admin-booking';
import { PaginationMeta } from '../types/room';
import { AdminGuestBookingForm } from '../components/AdminGuestBookingForm';
import { formatCurrency } from '../utils/format';

const PAGE_LIMIT = 10;
const VALID_STATUSES = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

const formatVietnamDateTime = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
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

const STATUS_BADGE_MAP: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: 'Đã xác nhận', className: 'badge-confirmed' },
  COMPLETED: { label: 'Đã hoàn tất', className: 'badge-completed' },
  CANCELLED: { label: 'Đã hủy', className: 'badge-cancelled' },
  NO_SHOW: { label: 'Không đến', className: 'badge-no-show' },
};

const PAYMENT_BADGE_MAP: Record<string, { label: string; className: string }> = {
  UNPAID: { label: 'Chưa thanh toán', className: 'badge-unpaid' },
  PAID: { label: 'Đã thanh toán', className: 'badge-paid' },
};

const DEFAULT_PAGINATION: PaginationMeta = {
  page: 1,
  limit: PAGE_LIMIT,
  total: 0,
  totalPages: 0,
};

export const AdminBookingsPage: React.FC = () => {
  const { principal, logout } = useAuth();
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
        setActionSuccessMessage(
          `Xác nhận thanh toán thành công cho đơn ${paymentModalTarget.bookingCode}`,
        );
        setPaymentModalTarget(null);
        fetchAdminBookings();
      } else {
        setPaymentError(res.message || 'Không thể xác nhận thanh toán.');
      }
    } catch (err: any) {
      setPaymentError(
        err.response?.data?.message || 'Không thể xác nhận thanh toán. Vui lòng thử lại.',
      );
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
        setActionSuccessMessage(`Đã hủy đơn ${cancelModalTarget.bookingCode} thành công`);
        setCancelModalTarget(null);
        fetchAdminBookings();
      } else {
        setCancelError(res.message || 'Không thể hủy đơn đặt phòng.');
      }
    } catch (err: any) {
      setCancelError(
        err.response?.data?.message || 'Không thể hủy đơn đặt phòng. Vui lòng thử lại.',
      );
    } finally {
      setIsCancelSubmitting(false);
    }
  };

  const handleCompleteBooking = async (booking: AdminBookingItem) => {
    try {
      const res = await adminBookingApi.completeBooking(booking.id);
      if (res.success) {
        setActionSuccessMessage(`Đã hoàn tất ca cho đơn ${booking.bookingCode}`);
        setRefreshIndex((prev) => prev + 1);
      }
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message || 'Không thể hoàn tất đơn đặt phòng. Vui lòng thử lại.',
      );
    }
  };

  const handleMarkNoShow = async (booking: AdminBookingItem) => {
    try {
      const res = await adminBookingApi.markNoShow(booking.id);
      if (res.success) {
        setActionSuccessMessage(`Đã đánh dấu không đến cho đơn ${booking.bookingCode}`);
        setRefreshIndex((prev) => prev + 1);
      }
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message || 'Không thể đánh dấu khách không đến. Vui lòng thử lại.',
      );
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
    <main className="page-container admin-page-container">
      {/* App Header */}
      <header className="app-header">
        <div className="brand-section">
          <h1>📋 Quản Lý Đặt Phòng — Admin</h1>
          <p>Quản trị viên: {principal?.fullName || principal?.email}</p>
        </div>

        <nav className="nav-actions">
          <Link to="/admin" className="btn btn-outline" data-testid="back-to-rooms-link">
            ← Quản lý phòng
          </Link>
          <Link to="/" className="btn btn-outline">
            Về trang chủ
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

      {/* Action Success Alert Banner */}
      {actionSuccessMessage && (
        <div
          className="alert alert-success"
          role="alert"
          data-testid="admin-action-success-banner"
          style={{
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{actionSuccessMessage}</span>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
            onClick={() => setActionSuccessMessage(null)}
          >
            ✕
          </button>
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
      <section className="card filter-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            alignItems: 'flex-end',
          }}
        >
          <div>
            <label
              htmlFor="filterBookingCode"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
            >
              Mã đặt phòng
            </label>
            <input
              id="filterBookingCode"
              type="text"
              className="form-control"
              value={draftCode}
              onChange={(e) => setDraftCode(e.target.value)}
              placeholder="VD: CS-20261003-ABCD"
              data-testid="filter-booking-code-input"
            />
          </div>

          <div>
            <label
              htmlFor="filterDate"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
            >
              Ngày bắt đầu (giờ Việt Nam)
            </label>
            <input
              id="filterDate"
              type="date"
              className="form-control"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              data-testid="filter-date-input"
            />
          </div>

          <div>
            <label
              htmlFor="filterStatus"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
            >
              Trạng thái đặt phòng
            </label>
            <select
              id="filterStatus"
              className="form-control"
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value)}
              data-testid="filter-status-select"
            >
              <option value="">-- Tất cả trạng thái --</option>
              <option value="CONFIRMED">Đã xác nhận (CONFIRMED)</option>
              <option value="COMPLETED">Đã hoàn tất (COMPLETED)</option>
              <option value="CANCELLED">Đã hủy (CANCELLED)</option>
              <option value="NO_SHOW">Không đến (NO_SHOW)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              data-testid="apply-filters-btn"
            >
              🔍 Tìm kiếm
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleClearFilters}
              data-testid="clear-filters-btn"
            >
              Xóa bộ lọc
            </button>
          </div>
        </form>
      </section>

      {/* Revenue KPI Summary Card */}
      {revenueError && (
        <div
          className="alert alert-error"
          data-testid="revenue-error-message"
          style={{
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            backgroundColor: '#fff5f5',
            color: '#c53030',
            border: '1px solid #feb2b2',
          }}
        >
          {revenueError}
        </div>
      )}
      {revenueData && (
        <section
          className="card revenue-card"
          data-testid="revenue-summary-card"
          style={{
            marginBottom: '1.5rem',
            padding: '1.25rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '2rem',
            alignItems: 'center',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
          }}
        >
          <div>
            <span style={{ fontSize: '0.85rem', color: '#718096', display: 'block' }}>
              💰 Doanh thu thực tế (Đã thanh toán)
            </span>
            <strong
              data-testid="actual-revenue"
              style={{ fontSize: '1.25rem', color: '#2b6cb0' }}
            >
              {formatCurrency(revenueData.actualRevenue)}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: '#718096', display: 'block' }}>
              📊 Doanh thu tạm tính (Tổng đã đặt)
            </span>
            <strong
              data-testid="potential-revenue"
              style={{ fontSize: '1.25rem', color: '#4a5568' }}
            >
              {formatCurrency(revenueData.potentialRevenue)}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: '#718096', display: 'block' }}>
              ⏳ Chưa thanh toán
            </span>
            <strong
              data-testid="unpaid-revenue"
              style={{ fontSize: '1.25rem', color: '#dd6b20' }}
            >
              {formatCurrency(revenueData.unpaidRevenue)}
            </strong>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#718096', marginLeft: 'auto' }}>
            <span>Đã thanh toán: {revenueData.paidBookings} đơn</span> |{' '}
            <span>Chưa thanh toán: {revenueData.unpaidBookings} đơn</span>
          </div>
        </section>
      )}

      {/* Booking List Table Section */}
      <section className="card admin-table-card">
        <div
          className="results-header-row"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 className="results-title" style={{ margin: 0, fontSize: '1.25rem' }}>
            Danh sách đơn đặt phòng{' '}
            <span className="results-count" data-testid="total-bookings-count">
              ({pagination.total} đơn)
            </span>
          </h2>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}
            onClick={fetchAdminBookings}
            data-testid="refresh-bookings-btn"
          >
            🔄 Tải lại
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div
            className="loading-container"
            data-testid="admin-bookings-loading"
            style={{ padding: '2rem', textAlign: 'center' }}
          >
            <p>Đang tải danh sách đặt phòng...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && errorMessage && (
          <div
            className="alert alert-danger"
            role="alert"
            data-testid="admin-bookings-error"
            style={{ margin: '1rem 0' }}
          >
            <p style={{ margin: '0 0 0.5rem 0' }}>{errorMessage}</p>
            <button type="button" className="btn btn-outline" onClick={fetchAdminBookings}>
              Thử lại
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !errorMessage && (!bookings || bookings.length === 0) && (
          <div
            className="empty-state-card"
            data-testid="admin-bookings-empty"
            style={{ padding: '3rem', textAlign: 'center' }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Không tìm thấy đơn đặt phòng</h3>
            <p style={{ color: '#718096', margin: 0 }}>
              Không có đơn nào khớp với tiêu chí tìm kiếm hiện tại. Hãy thử thay đổi hoặc xóa bộ
              lọc.
            </p>
          </div>
        )}

        {/* Bookings Table */}
        {!isLoading && !errorMessage && bookings && bookings.length > 0 && (
          <>
            <div className="table-responsive">
              <table className="admin-room-table" data-testid="admin-bookings-table">
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>Khách hàng</th>
                    <th>Phòng</th>
                    <th>Thời gian (Giờ VN)</th>
                    <th>Tổng tiền</th>
                    <th>Trạng thái</th>
                    <th>Thanh toán</th>
                    <th>Ghi chú</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => {
                    const statusCfg = STATUS_BADGE_MAP[booking.status] || {
                      label: booking.status,
                      className: 'badge-neutral',
                    };
                    const paymentCfg = PAYMENT_BADGE_MAP[booking.paymentStatus] || {
                      label: booking.paymentStatus,
                      className: 'badge-neutral',
                    };

                    return (
                      <tr key={booking.id} data-testid={`admin-booking-row-${booking.id}`}>
                        <td>
                          <strong data-testid={`booking-code-${booking.id}`}>
                            {booking.bookingCode}
                          </strong>
                        </td>
                        <td>
                          <div>
                            <span
                              className={`badge ${booking.customer.kind === 'GUEST' ? 'badge-maintenance' : 'badge-available'}`}
                              style={{ marginRight: '0.4rem', fontSize: '0.75rem' }}
                              data-testid={`customer-kind-${booking.id}`}
                            >
                              {booking.customer.kind === 'GUEST' ? 'Vãng lai' : 'Tài khoản'}
                            </span>
                            <span data-testid={`customer-name-${booking.id}`}>
                              {booking.customer.name}
                            </span>
                          </div>
                          {booking.customer.phone && (
                            <div
                              style={{ fontSize: '0.85rem', color: '#718096' }}
                              data-testid={`customer-phone-${booking.id}`}
                            >
                              📞 {booking.customer.phone}
                            </div>
                          )}
                        </td>
                        <td>{booking.room.name}</td>
                        <td style={{ fontSize: '0.875rem' }}>
                          <div>{formatVietnamDateTime(booking.startTime)}</div>
                          <div style={{ color: '#718096' }}>
                            đến {formatVietnamDateTime(booking.endTime)}
                          </div>
                        </td>
                        <td>
                          <strong>{formatCurrency(booking.totalAmount)}</strong>
                        </td>
                        <td>
                          <span
                            className={`badge ${statusCfg.className}`}
                            data-testid={`booking-status-${booking.id}`}
                          >
                            {statusCfg.label}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${paymentCfg.className}`}
                            data-testid={`payment-status-${booking.id}`}
                          >
                            {paymentCfg.label}
                          </span>
                        </td>
                        <td style={{ maxWidth: '200px', fontSize: '0.85rem', color: '#4a5568' }}>
                          {booking.note ? (
                            booking.note
                          ) : (
                            <span style={{ color: '#a0aec0' }}>—</span>
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              gap: '0.4rem',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                            }}
                          >
                            {booking.paymentStatus === 'UNPAID' &&
                              booking.status !== 'CANCELLED' && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  data-testid={`confirm-payment-btn-${booking.id}`}
                                  onClick={() => handleOpenPaymentModal(booking)}
                                >
                                  Thanh toán
                                </button>
                              )}
                            {booking.paymentStatus === 'PAID' && booking.paymentMethod && (
                              <span
                                style={{ fontSize: '0.8rem', color: '#38a169', fontWeight: 500 }}
                                data-testid={`paid-method-label-${booking.id}`}
                              >
                                ✓ {booking.paymentMethod}
                              </span>
                            )}
                            {booking.status === 'CONFIRMED' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success"
                                  data-testid={`complete-booking-btn-${booking.id}`}
                                  onClick={() => handleCompleteBooking(booking)}
                                >
                                  Hoàn tất
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-warning"
                                  data-testid={`no-show-booking-btn-${booking.id}`}
                                  onClick={() => handleMarkNoShow(booking)}
                                >
                                  Không đến
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger-outline"
                                  data-testid={`cancel-booking-btn-${booking.id}`}
                                  onClick={() => handleOpenCancelModal(booking)}
                                >
                                  Hủy đơn
                                </button>
                              </>
                            )}
                          </div>
                          {booking.status === 'CANCELLED' && booking.cancellationReason && (
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: '#e53e3e',
                                marginTop: '0.25rem',
                              }}
                              data-testid={`cancellation-reason-${booking.id}`}
                            >
                              Lý do: {booking.cancellationReason}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1.25rem 0',
                }}
                data-testid="admin-bookings-pagination"
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(pagination.page - 1)}
                  data-testid="pagination-prev-btn"
                >
                  ← Trang trước
                </button>
                <span data-testid="pagination-info">
                  Trang {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => handlePageChange(pagination.page + 1)}
                  data-testid="pagination-next-btn"
                >
                  Trang sau →
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Confirm Payment Modal */}
      {paymentModalTarget && (
        <div
          className="modal-overlay"
          data-testid="confirm-payment-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '440px',
              width: '100%',
              padding: '1.5rem',
              backgroundColor: '#fff',
              borderRadius: '8px',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>💳 Xác nhận thanh toán</h3>
            <p style={{ margin: '0 0 1rem 0', color: '#4a5568' }}>
              Đơn: <strong>{paymentModalTarget.bookingCode}</strong> — Số tiền:{' '}
              <strong style={{ color: '#2b6cb0' }}>
                {formatCurrency(paymentModalTarget.totalAmount)}
              </strong>
            </p>

            {paymentError && (
              <div
                className="alert alert-danger"
                role="alert"
                style={{ marginBottom: '1rem', padding: '0.75rem' }}
              >
                {paymentError}
              </div>
            )}

            <form onSubmit={handleSubmitPayment}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  htmlFor="paymentMethodSelect"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
                >
                  Phương thức thanh toán
                </label>
                <select
                  id="paymentMethodSelect"
                  className="form-control"
                  data-testid="payment-method-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'CASH' | 'QR')}
                >
                  <option value="CASH">Tiền mặt (CASH)</option>
                  <option value="QR">Quét mã QR (QR)</option>
                </select>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleClosePaymentModal}
                  data-testid="cancel-payment-btn"
                  disabled={isPaymentSubmitting}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-testid="submit-payment-btn"
                  disabled={isPaymentSubmitting}
                >
                  {isPaymentSubmitting ? 'Đang xác nhận...' : 'Xác nhận thanh toán'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Cancel Modal */}
      {cancelModalTarget && (
        <div
          className="modal-overlay"
          data-testid="admin-cancel-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '1.5rem',
              backgroundColor: '#fff',
              borderRadius: '8px',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: '#c53030' }}>
              ⚠️ Hủy đơn đặt phòng
            </h3>
            <p style={{ margin: '0 0 1rem 0', color: '#4a5568' }}>
              Đơn: <strong>{cancelModalTarget.bookingCode}</strong> — Phòng:{' '}
              {cancelModalTarget.room.name}
            </p>

            {cancelError && (
              <div
                className="alert alert-danger"
                role="alert"
                style={{ marginBottom: '1rem', padding: '0.75rem' }}
              >
                {cancelError}
              </div>
            )}

            <form onSubmit={handleSubmitCancel}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  htmlFor="cancelReasonInput"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
                >
                  Lý do hủy đơn <span style={{ color: '#e53e3e' }}>*</span>
                </label>
                <textarea
                  id="cancelReasonInput"
                  className="form-control"
                  rows={3}
                  data-testid="cancel-reason-input"
                  value={cancelReason}
                  onChange={(e) => {
                    setCancelReason(e.target.value);
                    if (cancelValidationError) setCancelValidationError(null);
                  }}
                  placeholder="Nhập lý do hủy (bắt buộc)..."
                />
                {cancelValidationError && (
                  <div
                    style={{
                      color: '#e53e3e',
                      fontSize: '0.85rem',
                      marginTop: '0.35rem',
                    }}
                  >
                    {cancelValidationError}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCloseCancelModal}
                  data-testid="close-cancel-modal-btn"
                  disabled={isCancelSubmitting}
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  data-testid="submit-cancel-btn"
                  disabled={isCancelSubmitting}
                >
                  {isCancelSubmitting ? 'Đang hủy...' : 'Xác nhận hủy đơn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
