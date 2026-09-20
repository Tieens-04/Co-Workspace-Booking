import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { bookingApi } from '../services/booking.api';
import { RoomStatus } from '../types/room';
import { BookingResult } from '../types/booking';
import { formatVnd, formatCurrency } from '../utils/format';

export interface BookingFormProps {
  roomId: string;
  roomName: string;
  roomStatus: RoomStatus;
  pricePerHour: string;
  isAuthenticated: boolean;
  userRole?: string | null;
}

export interface BookingFormErrors {
  startTime?: string;
  endTime?: string;
  note?: string;
  general?: string;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  roomId,
  roomName,
  roomStatus,
  pricePerHour,
  isAuthenticated,
  userRole,
}) => {
  const location = useLocation();

  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [errors, setErrors] = useState<BookingFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [bookingSuccess, setBookingSuccess] = useState<BookingResult | null>(null);
  const [isStaleMaintenance, setIsStaleMaintenance] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Reset form state when roomId changes
    setStartTime('');
    setEndTime('');
    setNote('');
    setErrors({});
    setIsSubmitting(false);
    setBookingSuccess(null);
    setIsStaleMaintenance(false);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [roomId]);

  // Compute preview for duration and total amount
  const preview = useMemo(() => {
    if (!startTime || !endTime) return null;
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return null;
    }
    const durationMinutes = (end.getTime() - start.getTime()) / (60 * 1000);
    const hours = durationMinutes / 60;
    const priceNum = Number(pricePerHour);
    if (Number.isNaN(priceNum)) return null;
    const estimatedTotal = priceNum * hours;
    return {
      durationHours: hours,
      durationMinutes,
      estimatedTotal,
    };
  }, [startTime, endTime, pricePerHour]);

  // If user is guest (not logged in)
  if (!isAuthenticated) {
    return (
      <section className="card booking-form-card" data-testid="booking-guest-prompt">
        <div className="booking-form-header">
          <h2 className="booking-form-title">Đặt Không Gian Làm Việc</h2>
        </div>
        <p>Vui lòng đăng nhập tài khoản khách hàng để đặt phòng này.</p>
        <Link
          to="/login"
          state={{ from: location.pathname }}
          className="btn btn-primary"
          data-testid="booking-login-link"
        >
          Đăng nhập để đặt phòng
        </Link>
      </section>
    );
  }

  // If user has ADMIN role
  if (userRole === 'ADMIN') {
    return (
      <section className="card booking-form-card" data-testid="booking-admin-notice">
        <div className="booking-form-header">
          <h2 className="booking-form-title">Đặt Không Gian Làm Việc</h2>
        </div>
        <p className="text-muted">
          Tài khoản Quản trị viên không thể đặt phòng qua biểu mẫu khách hàng. Vui lòng sử dụng tài
          khoản Khách hàng.
        </p>
      </section>
    );
  }

  // If room is in MAINTENANCE status (or backend just reported MAINTENANCE)
  if (roomStatus === 'MAINTENANCE' || isStaleMaintenance) {
    return (
      <section className="card booking-form-card" data-testid="booking-maintenance-box">
        <div className="booking-form-header">
          <h2 className="booking-form-title">Đặt Không Gian Làm Việc</h2>
        </div>
        <div className="booking-maintenance-alert" role="alert">
          <p style={{ margin: 0 }}>
            ⚠️ Phòng này đang trong trạng thái <strong>Bảo trì</strong> và hiện không thể tiếp nhận
            đặt chỗ mới.
          </p>
        </div>
      </section>
    );
  }

  // If booking succeeded, show confirmation view
  if (bookingSuccess) {
    return (
      <section
        className="card booking-form-card booking-success-container"
        data-testid="booking-success-view"
      >
        <div className="booking-success-box" role="status">
          <h2 className="booking-success-title">🎉 Đặt phòng thành công!</h2>
          <p>
            Mã đặt phòng của bạn là:{' '}
            <strong data-testid="booking-success-code">{bookingSuccess.bookingCode}</strong>
          </p>
          <ul style={{ margin: '0.75rem 0 0.75rem 1.25rem', padding: 0 }}>
            <li>
              <strong>Phòng:</strong> {bookingSuccess.room.name || roomName}
            </li>
            <li>
              <strong>Thời gian:</strong>{' '}
              {new Date(bookingSuccess.startTime).toLocaleString('vi-VN')} –{' '}
              {new Date(bookingSuccess.endTime).toLocaleString('vi-VN')}
            </li>
            <li>
              <strong>Tổng tiền:</strong>{' '}
              <span className="price-highlight" data-testid="booking-success-total">
                {formatCurrency(bookingSuccess.totalAmount)}
              </span>
            </li>
            <li>
              <strong>Trạng thái đặt:</strong> {bookingSuccess.status} (
              {bookingSuccess.paymentStatus})
            </li>
          </ul>
          <p style={{ fontSize: '0.875rem', color: '#15803d', margin: '0.5rem 0 0 0' }}>
            Vui lòng hoàn tất thanh toán khi đến nhận phòng.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setBookingSuccess(null);
            setStartTime('');
            setEndTime('');
            setNote('');
          }}
          data-testid="booking-new-btn"
        >
          Đặt thêm khung giờ khác
        </button>
      </section>
    );
  }

  // Validate form client-side
  const validateForm = (): boolean => {
    const newErrors: BookingFormErrors = {};
    if (!startTime) {
      newErrors.startTime = 'Vui lòng chọn thời gian bắt đầu';
    }
    if (!endTime) {
      newErrors.endTime = 'Vui lòng chọn thời gian kết thúc';
    }

    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (Number.isNaN(start.getTime())) {
        newErrors.startTime = 'Thời gian bắt đầu không hợp lệ';
      }
      if (Number.isNaN(end.getTime())) {
        newErrors.endTime = 'Thời gian kết thúc không hợp lệ';
      }

      if (!newErrors.startTime && !newErrors.endTime) {
        if (start.getMinutes() % 30 !== 0) {
          newErrors.startTime = 'Thời gian bắt đầu phải theo mốc 30 phút (ví dụ: 09:00, 09:30)';
        }
        if (end.getMinutes() % 30 !== 0) {
          newErrors.endTime = 'Thời gian kết thúc phải theo mốc 30 phút (ví dụ: 10:00, 10:30)';
        }

        if (end <= start) {
          newErrors.endTime = 'Thời gian kết thúc phải sau thời gian bắt đầu';
        } else {
          const durationMins = (end.getTime() - start.getTime()) / (60 * 1000);
          if (durationMins < 60) {
            newErrors.endTime = 'Thời lượng đặt phòng tối thiểu là 1 giờ';
          } else if (durationMins > 480) {
            newErrors.endTime = 'Thời lượng đặt phòng tối đa là 8 giờ';
          }
        }

        const now = new Date();
        if (start <= now) {
          newErrors.startTime = 'Thời gian bắt đầu không được ở trong quá khứ';
        } else if (start.getTime() - now.getTime() < 30 * 60 * 1000) {
          newErrors.startTime = 'Phải đặt phòng trước thời gian bắt đầu ít nhất 30 phút';
        }
      }
    }

    if (note && note.trim().length > 500) {
      newErrors.note = 'Ghi chú không được vượt quá 500 ký tự';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!validateForm()) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const startIso = new Date(startTime).toISOString();
      const endIso = new Date(endTime).toISOString();

      const res = await bookingApi.createBooking(
        {
          roomId,
          startTime: startIso,
          endTime: endIso,
          note: note.trim() === '' ? null : note.trim(),
        },
        controller.signal,
      );

      if (controller.signal.aborted || abortControllerRef.current !== controller) return;

      if (res.success) {
        setBookingSuccess(res.data);
      }
    } catch (err: any) {
      if (controller.signal.aborted || abortControllerRef.current !== controller) return;

      const code = err.response?.data?.code;
      const message = err.response?.data?.message;
      const details = err.response?.data?.details;

      if (code === 'ROOM_NOT_AVAILABLE') {
        setIsStaleMaintenance(true);
        setErrors({
          general: message || 'Phòng vừa được chuyển sang bảo trì, không thể đặt phòng.',
        });
      } else if (code === 'BOOKING_CONFLICT') {
        setErrors({
          general:
            message ||
            'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác hoặc điều chỉnh thời gian.',
        });
      } else if (code === 'VALIDATION_ERROR' && Array.isArray(details) && details.length > 0) {
        const fieldErrors: BookingFormErrors = {};
        for (const item of details) {
          if (item.field === 'startTime') fieldErrors.startTime = item.message;
          else if (item.field === 'endTime') fieldErrors.endTime = item.message;
          else if (item.field === 'note') fieldErrors.note = item.message;
          else if (!fieldErrors.general) fieldErrors.general = item.message;
        }
        setErrors(fieldErrors);
      } else {
        setErrors({
          general: message || 'Không thể tạo đặt phòng. Vui lòng kiểm tra lại thông tin.',
        });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  return (
    <section
      className="card booking-form-card"
      data-testid="customer-booking-form"
      aria-labelledby="booking-form-heading"
    >
      <div className="booking-form-header">
        <h2 id="booking-form-heading" className="booking-form-title">
          Đặt Không Gian Làm Việc
        </h2>
      </div>

      {errors.general && (
        <div
          className="alert alert-danger"
          role="alert"
          data-testid="booking-general-error"
          style={{ marginBottom: '1.25rem' }}
        >
          {errors.general}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
        <div className="admin-form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="booking-start-time" className="form-label">
              Thời gian bắt đầu <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              id="booking-start-time"
              type="datetime-local"
              step={1800}
              className={`form-control ${errors.startTime ? 'has-error' : ''}`}
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                if (errors.startTime) setErrors((prev) => ({ ...prev, startTime: undefined }));
              }}
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.startTime)}
              aria-describedby={errors.startTime ? 'error-booking-start' : undefined}
              data-testid="booking-start-input"
            />
            {errors.startTime && (
              <p id="error-booking-start" className="field-error" data-testid="error-booking-start">
                {errors.startTime}
              </p>
            )}
          </div>

          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="booking-end-time" className="form-label">
              Thời gian kết thúc <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              id="booking-end-time"
              type="datetime-local"
              step={1800}
              className={`form-control ${errors.endTime ? 'has-error' : ''}`}
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
                if (errors.endTime) setErrors((prev) => ({ ...prev, endTime: undefined }));
              }}
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.endTime)}
              aria-describedby={errors.endTime ? 'error-booking-end' : undefined}
              data-testid="booking-end-input"
            />
            {errors.endTime && (
              <p id="error-booking-end" className="field-error" data-testid="error-booking-end">
                {errors.endTime}
              </p>
            )}
          </div>
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label htmlFor="booking-note" className="form-label" style={{ marginBottom: 0 }}>
              Ghi chú đặt phòng
            </label>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {note.length}/500
            </span>
          </div>
          <textarea
            id="booking-note"
            rows={2}
            className={`form-control ${errors.note ? 'has-error' : ''}`}
            placeholder="Yêu cầu thêm về bàn ghế, máy chiếu, chuẩn bị trước..."
            maxLength={500}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (errors.note) setErrors((prev) => ({ ...prev, note: undefined }));
            }}
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.note)}
            aria-describedby={errors.note ? 'error-booking-note' : undefined}
            data-testid="booking-note-input"
          />
          {errors.note && (
            <p id="error-booking-note" className="field-error" data-testid="error-booking-note">
              {errors.note}
            </p>
          )}
        </div>

        {/* Display-only price & duration preview */}
        {preview && (
          <div className="booking-price-preview" data-testid="booking-price-preview">
            <div className="booking-price-row">
              <span>Thời lượng đặt:</span>
              <strong>{preview.durationHours} giờ</strong>
            </div>
            <div className="booking-price-row">
              <span>Đơn giá:</span>
              <span>{formatVnd(pricePerHour)}</span>
            </div>
            <div className="booking-price-row" style={{ marginTop: '0.5rem' }}>
              <span>Ước tính tổng tiền:</span>
              <span className="booking-price-total">{formatCurrency(preview.estimatedTotal)}</span>
            </div>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '0.5rem' }}
          disabled={isSubmitting}
          data-testid="booking-submit-btn"
        >
          {isSubmitting ? 'Đang gửi yêu cầu đặt...' : 'Xác nhận đặt phòng'}
        </button>
      </form>
    </section>
  );
};
