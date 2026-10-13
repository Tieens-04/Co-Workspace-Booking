import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { bookingApi } from '../services/booking.api';
import { BookingResult } from '../types/booking';
import { BookingSummary } from '../components/BookingSummary';
import { AppHeader } from '../layouts/AppHeader';
import { AppFooter } from '../layouts/AppFooter';
import styles from './BookingDetailPage.module.css';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

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
      const errorMsg =
        err.response?.data?.message || err.message || 'Không thể hủy đặt phòng';

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

  return (
    <div className={styles.pageWrapper}>
      <AppHeader />

      <main className={`page-container booking-detail-container ${styles.container}`}>
        <div className={styles.backNav}>
          <Link to="/bookings" className={styles.backBtn}>
            <ArrowLeft size={16} /> Quay lại lịch sử đặt phòng
          </Link>
        </div>

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
              <article className={`card booking-detail-card ${styles.detailCard}`} data-testid="booking-detail-card">
                <div className={`detail-header-banner ${styles.headerSection}`}>
                  <div>
                    <h2 className={`detail-title ${styles.title}`}>Thông tin chi tiết đặt phòng</h2>
                    <span className={styles.codeText}>Mã đặt phòng</span>
                  </div>
                  <div className="detail-code-badge">
                    <span className="code-label">MÃ ĐƠN:</span>
                    <strong className={`code-value ${styles.codeText}`} data-testid="detail-booking-code">
                      {effectiveBooking.bookingCode}
                    </strong>
                  </div>
                </div>

                {state.cancelFeedback && (
                  <div
                    className={`cancel-feedback-banner ${state.cancelFeedback.type}`}
                    role={state.cancelFeedback.type === 'error' ? 'alert' : 'status'}
                    data-testid={`cancel-${state.cancelFeedback.type}-banner`}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{state.cancelFeedback.message}</span>
                      {state.cancelFeedback.code === 'BOOKING_STATE_CONFLICT' && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '0.25rem 0.75rem', fontSize: '0.8125rem' }}
                          onClick={fetchDetail}
                          data-testid="cancel-conflict-refresh-btn"
                        >
                          Tải lại dữ liệu
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="detail-summary-wrapper">
                  <BookingSummary
                    booking={effectiveBooking}
                    showPaymentDetails={true}
                    showNote={true}
                  />
                </div>

                {effectiveBooking.status === 'CONFIRMED' && (
                  <section className="cancellation-section" data-testid="cancellation-section">
                    <div className="cancellation-policy-info">
                      <span aria-hidden="true">ℹ️</span>
                      <div>
                        <strong>Chính sách hủy đặt phòng:</strong> Quý khách chỉ có thể tự hủy đơn đặt phòng trước thời gian bắt đầu ít nhất 1 giờ. Sau khi hủy thành công, khung giờ sẽ được giải phóng.
                      </div>
                    </div>

                    {!state.showCancelConfirm ? (
                      <div className="cancellation-init-row">
                        <button
                          type="button"
                          className="btn btn-danger-outline"
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
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`cancellation-confirm-box ${styles.cancelModalOverlay}`}
                        role="region"
                        aria-labelledby="confirm-cancel-heading"
                        data-testid="cancellation-confirm-box"
                      >
                        <div className={styles.cancelModal}>
                          <h4 id="confirm-cancel-heading" className={`cancellation-confirm-text ${styles.modalTitle}`}>
                            <AlertTriangle size={20} />
                            Bạn có chắc chắn muốn hủy đơn đặt phòng này không?
                          </h4>
                          <p className={`cancellation-confirm-subtext ${styles.modalDescription}`}>
                            Thao tác hủy không thể hoàn tác. Khung giờ này sẽ được giải phóng cho người dùng khác.
                          </p>
                          <div className={`cancellation-confirm-actions ${styles.modalActions}`}>
                            <button
                              type="button"
                              className="btn btn-outline"
                              disabled={state.isCancelling}
                              onClick={() =>
                                setState((prev) => ({ ...prev, showCancelConfirm: false }))
                              }
                              data-testid="abort-cancel-btn"
                            >
                              Đóng
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              disabled={state.isCancelling}
                              onClick={handleCancelBooking}
                              data-testid="confirm-cancel-btn"
                            >
                              {state.isCancelling ? 'Đang hủy...' : 'Xác nhận hủy'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                )}

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
      </main>

      <AppFooter />
    </div>
  );
};
