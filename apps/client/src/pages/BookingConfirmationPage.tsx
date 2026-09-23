import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookingResult } from '../types/booking';
import { formatCurrency } from '../utils/format';
import { AuthContext } from '../context/auth-context-base';
import { isValidBookingResult, sanitizeHistoryState } from '../utils/history';

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
      <main className="page-container confirmation-page-container">
        <header className="app-header">
          <div className="brand-section">
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <h1>🏢 Co-Space Working</h1>
            </Link>
            <p>Xác nhận đặt phòng</p>
          </div>
        </header>
        <div className="loading-container" style={{ padding: '2rem', textAlign: 'center' }}>
          Đang tải...
        </div>
      </main>
    );
  }

  return (
    <main className="page-container confirmation-page-container">
      <header className="app-header">
        <div className="brand-section">
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h1>🏢 Co-Space Working</h1>
          </Link>
          <p>Xác nhận đặt phòng</p>
        </div>
        <nav className="nav-actions">
          <Link to="/" className="btn btn-outline">
            Danh sách phòng
          </Link>
        </nav>
      </header>

      {!isValidBooking || !booking ? (
        <section
          className="card error-state-card confirmation-empty-card"
          role="alert"
          data-testid="confirmation-empty-state"
        >
          <div className="state-icon" aria-hidden="true">
            ℹ️
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
        <article className="card confirmation-card" data-testid="booking-confirmation-view">
          <div className="confirmation-header-banner" role="status">
            <span className="confirmation-success-icon" aria-hidden="true">
              🎉
            </span>
            <h2 className="confirmation-title">Đặt không gian làm việc thành công!</h2>
            <p className="confirmation-subtitle">
              Yêu cầu đặt phòng của bạn đã được hệ thống tiếp nhận và xác nhận giữ chỗ.
            </p>
          </div>

          <div className="confirmation-code-wrapper">
            <span className="confirmation-code-label">MÃ ĐẶT PHÒNG CỦA BẠN</span>
            <span
              className="confirmation-code-value"
              data-testid="booking-confirmation-code"
              data-booking-code={booking.bookingCode}
            >
              <strong data-testid="booking-success-code">{booking.bookingCode}</strong>
            </span>
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
  );
};
