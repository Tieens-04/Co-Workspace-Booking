import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookingResult } from '../types/booking';
import { formatCurrency } from '../utils/format';
import { AuthContext } from '../context/auth-context-base';
import { isValidBookingResult, sanitizeHistoryState } from '../utils/history';
import { AppHeader } from '../layouts/AppHeader';
import { AppFooter } from '../layouts/AppFooter';
import styles from './BookingConfirmationPage.module.css';
import { CheckCircle2, Copy, Check, Info } from 'lucide-react';

export const BookingConfirmationPage: React.FC = () => {
  const location = useLocation();
  const auth = useContext(AuthContext);
  const isAuthenticated = auth ? auth.isAuthenticated : false;
  const principal = auth ? auth.principal : null;
  const isLoading = auth ? auth.isLoading : false;
  const [copied, setCopied] = useState(false);

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
      <div className={styles.pageWrapper}>
        <AppHeader />
        <main className={`page-container confirmation-page-container ${styles.container}`}>
          <div className="loading-container" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Đang tải...
          </div>
        </main>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className={styles.pageWrapper}>
      <AppHeader />

      <main className={`page-container confirmation-page-container ${styles.container}`}>
      {!isValidBooking || !booking ? (
        <section
          className="card error-state-card confirmation-empty-card"
          role="alert"
          data-testid="confirmation-empty-state"
        >
          <div className="state-icon" aria-hidden="true" style={{ display: 'flex', justifyContent: 'center' }}>
            <Info size={36} color="var(--color-primary)" />
          </div>
          <h2 className="error-title">Không tìm thấy thông tin đặt phòng</h2>
          <p className="error-description">
            Trang xác nhận không có dữ liệu đặt phòng hợp lệ hoặc phiên làm việc đã kết thúc. Vui
            lòng kiểm tra lại thông tin và thực hiện đặt chỗ mới.
          </p>
          <div className="action-row" style={{ justifyContent: 'center' }}>
            <Link to="/" className="btn btn-primary" data-testid="confirmation-back-home-btn">
              Về danh sách phòng
            </Link>
          </div>
        </section>
      ) : (
        <article className={`card confirmation-card ${styles.ticketCard}`} data-testid="booking-confirmation-view">
          <div className={`confirmation-header-banner ${styles.ticketHeader}`} role="status">
            <div className={styles.successIconBadge} aria-hidden="true">
              <CheckCircle2 size={28} />
            </div>
            <h2 className={`confirmation-title ${styles.ticketTitle}`}>Đặt không gian làm việc thành công!</h2>
            <p className={`confirmation-subtitle ${styles.ticketSubtitle}`}>
              Yêu cầu đặt phòng của bạn đã được hệ thống tiếp nhận và xác nhận giữ chỗ.
            </p>
          </div>

          <div className={`confirmation-code-wrapper ${styles.codeBox}`}>
            <div className={styles.codeLabelCol}>
              <span className={`confirmation-code-label ${styles.codeLabel}`}>MÃ ĐẶT PHÒNG CỦA BẠN</span>
              <span
                className={`confirmation-code-value ${styles.codeValue}`}
                data-testid="booking-confirmation-code"
                data-booking-code={booking.bookingCode}
              >
                <strong data-testid="booking-success-code">{booking.bookingCode}</strong>
              </span>
            </div>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={() => {
                navigator.clipboard.writeText(booking.bookingCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              aria-label="Sao chép mã đặt phòng"
            >
              {copied ? (
                <>
                  <Check size={14} color="var(--color-success)" />
                  <span style={{ color: 'var(--color-success)' }}>Đã chép</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          </div>

          <div className="confirmation-details-card">
            <div className="confirmation-detail-row">
              <span className="detail-label">Phòng làm việc:</span>
              <strong className="detail-value" data-testid="booking-confirmation-room">
                {booking.room.name}
              </strong>
            </div>

            <div className="confirmation-detail-row">
              <span className="detail-label">Thời gian đặt chỗ:</span>
              <span className="detail-value" data-testid="booking-confirmation-time">
                {new Date(booking.startTime).toLocaleString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                })}{' '}
                –{' '}
                {new Date(booking.endTime).toLocaleString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                })}
              </span>
            </div>

            <div className="confirmation-detail-row">
              <span className="detail-label">Ghi chú:</span>
              <span className="detail-value" data-testid="booking-confirmation-note">
                {typeof booking.note === 'string' && booking.note.trim() !== ''
                  ? booking.note.trim()
                  : 'Không có'}
              </span>
            </div>

            <div className="confirmation-detail-row">
              <span className="detail-label">Trạng thái đặt chỗ:</span>
              <span className="detail-value" data-testid="booking-confirmation-status">
                <span className="badge badge-available">{booking.status}</span>
              </span>
            </div>

            <div className="confirmation-detail-row">
              <span className="detail-label">Trạng thái thanh toán:</span>
              <span className="detail-value" data-testid="booking-confirmation-payment">
                <span className="badge badge-unpaid">{booking.paymentStatus}</span>
              </span>
            </div>

            <div className="confirmation-detail-row total-row">
              <span className="detail-label">Tổng tiền (do hệ thống tính):</span>
              <span
                className="detail-value price-highlight"
                data-testid="booking-confirmation-total"
              >
                <strong data-testid="booking-success-total">
                  {formatCurrency(booking.totalAmount)}
                </strong>
              </span>
            </div>
          </div>

          {/* AC2: Hướng dẫn thanh toán tại quầy */}
          <div
            className="booking-payment-instruction-box"
            role="note"
            data-testid="booking-payment-instruction"
          >
            <div className="payment-instruction-title">💵 Hướng dẫn thanh toán tại quầy:</div>
            <p className="payment-instruction-text">
              Đơn đặt phòng của bạn đang ở trạng thái <strong>{booking.paymentStatus}</strong>. Vui
              lòng xuất trình mã đặt phòng <strong>{booking.bookingCode}</strong> và hoàn tất{' '}
              <strong>thanh toán tại quầy</strong> khi đến nhận phòng tại Co-Space Working.
            </p>
          </div>

          <div className="confirmation-actions">
            {booking.id && (
              <Link
                to={`/bookings/${booking.id}`}
                className="btn btn-outline"
                data-testid="confirmation-view-detail-btn"
              >
                Xem chi tiết đặt phòng
              </Link>
            )}
            <Link to="/bookings" className="btn btn-outline" data-testid="confirmation-history-btn">
              Lịch sử đặt phòng
            </Link>
            {booking.room?.id && (
              <Link
                to={`/rooms/${booking.room.id}`}
                className="btn btn-outline"
                data-testid="confirmation-back-room-btn"
              >
                ← Quay lại trang phòng
              </Link>
            )}
            <Link to="/" className="btn btn-primary" data-testid="confirmation-back-home-btn">
              Về danh sách phòng
            </Link>
          </div>
        </article>
      )}
      </main>

      <AppFooter />
    </div>
  );
};
