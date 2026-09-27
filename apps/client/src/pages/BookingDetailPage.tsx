import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { bookingApi } from '../services/booking.api';
import { BookingResult } from '../types/booking';
import { BookingSummary } from '../components/BookingSummary';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface BookingDetailState {
  sessionUserId: string | undefined;
  bookingId: string | undefined;
  booking: BookingResult | null;
  isLoading: boolean;
  isNotFound: boolean;
  errorMessage: string | null;
}

export const BookingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { principal, logout } = useAuth();

  const [state, setState] = useState<BookingDetailState>(() => ({
    sessionUserId: principal?.id,
    bookingId: id,
    booking: null,
    isLoading: true,
    isNotFound: false,
    errorMessage: null,
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

        setState({
          sessionUserId: requestingUser,
          bookingId: targetId,
          booking: res.data,
          isLoading: false,
          isNotFound: false,
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

        const statusCode = err.response?.status;
        const errorCode = err.response?.data?.code;

        setState({
          sessionUserId: requestingUser,
          bookingId: targetId,
          booking: null,
          isLoading: false,
          isNotFound: statusCode === 404 || errorCode === 'BOOKING_NOT_FOUND',
          errorMessage:
            statusCode === 404 || errorCode === 'BOOKING_NOT_FOUND'
              ? null
              : err.response?.data?.message || err.message || 'Không thể tải chi tiết đặt phòng',
        });
      });
  }, [id, principal?.id]);

  useEffect(() => {
    fetchDetail();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchDetail]);

  return (
    <main className="page-container booking-detail-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h1>🏢 Co-Space Working</h1>
          </Link>
          <p>Chi tiết đặt phòng</p>
        </div>

        <nav className="nav-actions">
          {principal && (
            <span className="user-status-text">
              Xin chào, <strong>{principal.fullName || principal.email || principal.id}</strong>{' '}
              <span className="badge badge-customer">CUSTOMER</span>
            </span>
          )}
          <Link to="/bookings" className="btn btn-outline">
            Lịch sử đặt phòng
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
      <div className="detail-content-layout">
        {/* Loading State */}
        {effectiveIsLoading && (
          <div
            className="card booking-detail-loading"
            role="status"
            aria-busy="true"
            aria-label="Đang tải chi tiết đặt phòng"
          >
            <div className="skeleton skeleton-title" style={{ width: '50%' }} />
            <div className="skeleton skeleton-text" style={{ width: '80%' }} />
            <div className="skeleton skeleton-text" style={{ width: '60%' }} />
            <div className="skeleton skeleton-text" style={{ width: '40%' }} />
          </div>
        )}

        {/* Not Found / IDOR State */}
        {!effectiveIsLoading && effectiveIsNotFound && (
          <article
            className="card error-state-card booking-not-found-card"
            role="alert"
            data-testid="booking-not-found-state"
          >
            <div className="state-icon" aria-hidden="true">
              🔍
            </div>
            <h2 className="error-title">Không tìm thấy thông tin đặt phòng</h2>
            <p className="error-description">
              Đơn đặt phòng này không tồn tại hoặc bạn không có quyền truy cập vào thông tin này.
            </p>
            <div className="detail-actions" style={{ justifyContent: 'center' }}>
              <Link to="/bookings" className="btn btn-primary">
                ← Về lịch sử đặt phòng
              </Link>
              <Link to="/" className="btn btn-outline">
                Danh sách phòng
              </Link>
            </div>
          </article>
        )}

        {/* Error / Network Failure State */}
        {!effectiveIsLoading && !effectiveIsNotFound && effectiveErrorMessage && (
          <div className="card error-state-card" role="alert">
            <div className="state-icon" aria-hidden="true">
              ⚠️
            </div>
            <h3 className="error-title">Lỗi kết nối máy chủ</h3>
            <p className="error-description">{effectiveErrorMessage}</p>
            <button type="button" className="btn btn-primary" onClick={fetchDetail}>
              Thử lại
            </button>
          </div>
        )}

        {/* Success State */}
        {!effectiveIsLoading &&
          !effectiveIsNotFound &&
          !effectiveErrorMessage &&
          effectiveBooking && (
            <article className="card booking-detail-card" data-testid="booking-detail-card">
              <div className="detail-header-banner">
                <h2 className="detail-title">Thông tin chi tiết đặt phòng</h2>
                <div className="detail-code-badge">
                  <span className="code-label">MÃ ĐƠN:</span>
                  <strong className="code-value" data-testid="detail-booking-code">
                    {effectiveBooking.bookingCode}
                  </strong>
                </div>
              </div>

              <div className="detail-summary-wrapper">
                <BookingSummary
                  booking={effectiveBooking}
                  showPaymentDetails={true}
                  showNote={true}
                />
              </div>

              <div className="detail-actions-footer">
                <Link
                  to="/bookings"
                  className="btn btn-outline"
                  data-testid="detail-back-history-btn"
                >
                  ← Về lịch sử đặt phòng
                </Link>
                {effectiveBooking.room?.id && (
                  <Link
                    to={`/rooms/${effectiveBooking.room.id}`}
                    className="btn btn-outline"
                    data-testid="detail-view-room-btn"
                  >
                    Xem phòng làm việc
                  </Link>
                )}
                <Link to="/" className="btn btn-primary" data-testid="detail-back-home-btn">
                  Về danh sách phòng
                </Link>
              </div>
            </article>
          )}
      </div>

      <footer className="app-footer">
        Co-Space Working Platform — Hệ thống đặt chỗ làm việc thông minh.
      </footer>
    </main>
  );
};
