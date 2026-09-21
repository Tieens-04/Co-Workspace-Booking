import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { bookingApi } from '../services/booking.api';
import { RoomStatus, RoomAvailabilitySlot } from '../types/room';
import { BookingResult } from '../types/booking';
import { formatVnd, formatCurrency } from '../utils/format';
import { useRoomAvailability } from '../hooks/useRoomAvailability';
import { TimeGrid } from './TimeGrid';
import {
  getVietnamTodayString,
  formatVnDateTimeLocal,
  parseVnDateTimeLocalToUtc,
  getCoveredVnDates,
  calculateEstimatedTotal,
  validateBookingSelection,
  checkRangeAvailability,
} from '../utils/bookingTime';

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

  const [viewDate, setViewDate] = useState<string>(() => getVietnamTodayString());
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [selectingStartTime, setSelectingStartTime] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');
  const [errors, setErrors] = useState<BookingFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [bookingSuccess, setBookingSuccess] = useState<BookingResult | null>(null);
  const [isStaleMaintenance, setIsStaleMaintenance] = useState<boolean>(false);
  const [hasBookingConflict, setHasBookingConflict] = useState<boolean>(false);
  const [currentMs, setCurrentMs] = useState<number>(() => Date.now());

  const abortControllerRef = useRef<AbortController | null>(null);

  // Periodic clock update to re-evaluate lead time / validity
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMs(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Compute parsed UTC instants from wall-clock input values
  const startUtc = useMemo(() => parseVnDateTimeLocalToUtc(startTime), [startTime]);
  const endUtc = useMemo(() => parseVnDateTimeLocalToUtc(endTime), [endTime]);

  // Compute covered Vietnam dates for the selection (up to 2 dates if overnight)
  const coveredDates = useMemo(() => {
    if (startUtc && endUtc && endUtc > startUtc) {
      return getCoveredVnDates(startUtc, endUtc);
    }
    return [viewDate];
  }, [startUtc, endUtc, viewDate]);

  // Dates to load: always include viewDate and any covered dates from selection
  const datesToLoad = useMemo(() => {
    return Array.from(new Set([viewDate, ...coveredDates]));
  }, [viewDate, coveredDates]);

  // Enable availability fetch only for active customer form with available room
  const isAvailabilityEnabled =
    isAuthenticated && userRole !== 'ADMIN' && roomStatus === 'AVAILABLE' && !isStaleMaintenance;

  const availability = useRoomAvailability(roomId, datesToLoad, isAvailabilityEnabled);

  // Combine all loaded slots across covered dates. If any covered date is not loaded yet, return null.
  const allLoadedCoveredSlots = useMemo(() => {
    const slots: RoomAvailabilitySlot[] = [];
    for (const d of coveredDates) {
      const daySlots = availability.slotsByDate[d];
      if (daySlots && daySlots.length > 0) {
        slots.push(...daySlots);
      } else {
        return null;
      }
    }
    return slots;
  }, [coveredDates, availability.slotsByDate]);

  // F2 & N2: Derive selection validity from shared validator, clock, conflict status, and slot availability
  const isSelectionValid = useMemo(() => {
    if (!startUtc || !endUtc || endUtc <= startUtc) return false;
    if (hasBookingConflict) return false;
    if (availability.loading || Boolean(availability.error)) return false;
    const timeValidation = validateBookingSelection(startUtc, endUtc, new Date(currentMs));
    if (!timeValidation.isValid) return false;
    if (!allLoadedCoveredSlots) return false;
    const rangeCheck = checkRangeAvailability(startUtc, endUtc, allLoadedCoveredSlots);
    return rangeCheck.isAvailable;
  }, [
    startUtc,
    endUtc,
    currentMs,
    allLoadedCoveredSlots,
    hasBookingConflict,
    availability.loading,
    availability.error,
  ]);

  useEffect(() => {
    // Reset form state when roomId changes
    setViewDate(getVietnamTodayString());
    setStartTime('');
    setEndTime('');
    setSelectingStartTime(null);
    setNote('');
    setErrors({});
    setIsSubmitting(false);
    setBookingSuccess(null);
    setIsStaleMaintenance(false);
    setHasBookingConflict(false);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [roomId]);

  // Handle date picker change for viewing grid
  const handleViewDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setViewDate(newDate);
    setStartTime('');
    setEndTime('');
    setSelectingStartTime(null);
    setErrors({});
    setHasBookingConflict(false);
  };

  // Handle manual start time input change
  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStartTime(val);
    setSelectingStartTime(null);
    setHasBookingConflict(false);
    if (errors.startTime) setErrors((prev) => ({ ...prev, startTime: undefined }));

    const datePart = val.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart !== viewDate) {
      setViewDate(datePart);
    }
  };

  // Handle manual end time input change
  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEndTime(val);
    setSelectingStartTime(null);
    setHasBookingConflict(false);
    if (errors.endTime) setErrors((prev) => ({ ...prev, endTime: undefined }));
  };

  // Grid callbacks
  const handleSelectStart = useCallback((startIso: string) => {
    setSelectingStartTime(startIso);
    const localStart = formatVnDateTimeLocal(new Date(startIso));
    setStartTime(localStart);
    setEndTime('');
    setErrors({});
    setHasBookingConflict(false);
  }, []);

  const handleSelectRange = useCallback((startIso: string, endIso: string) => {
    setSelectingStartTime(null);
    const localStart = formatVnDateTimeLocal(new Date(startIso));
    const localEnd = formatVnDateTimeLocal(new Date(endIso));
    setStartTime(localStart);
    setEndTime(localEnd);
    setErrors({});
    setHasBookingConflict(false);
  }, []);

  // Compute preview for duration and total amount using decimal-safe rounding
  const preview = useMemo(() => {
    if (!isSelectionValid || !startTime || !endTime || !startUtc || !endUtc || endUtc <= startUtc) {
      return null;
    }

    const durationMinutes = (endUtc.getTime() - startUtc.getTime()) / (60 * 1000);
    const hours = durationMinutes / 60;
    const estimatedTotal = calculateEstimatedTotal(pricePerHour, durationMinutes);
    if (estimatedTotal === null) return null;

    return {
      durationHours: hours,
      durationMinutes,
      estimatedTotal,
    };
  }, [isSelectionValid, startTime, endTime, startUtc, endUtc, pricePerHour]);

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

  // If room is in MAINTENANCE status (or backend just reported MAINTENANCE via GET or POST)
  if (
    roomStatus === 'MAINTENANCE' ||
    isStaleMaintenance ||
    availability.errorCode === 'ROOM_NOT_AVAILABLE'
  ) {
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
              {new Date(bookingSuccess.startTime).toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
              })}{' '}
              –{' '}
              {new Date(bookingSuccess.endTime).toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
              })}
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
            setSelectingStartTime(null);
            setNote('');
            availability.refresh().catch(() => {});
          }}
          data-testid="booking-new-btn"
        >
          Đặt thêm khung giờ khác
        </button>
      </section>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (hasBookingConflict) {
      setErrors({
        general:
          'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác hoặc điều chỉnh thời gian.',
      });
      return;
    }

    if (availability.error) {
      setErrors({
        general: availability.error || 'Không thể kiểm tra lịch trống của phòng. Vui lòng thử lại.',
      });
      return;
    }

    const validation = validateBookingSelection(startUtc, endUtc, new Date(), note);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Check against currently loaded slots first to avoid unnecessary network request if already known booked
    if (allLoadedCoveredSlots) {
      const currentRangeCheck = checkRangeAvailability(startUtc!, endUtc!, allLoadedCoveredSlots);
      if (!currentRangeCheck.isAvailable) {
        setHasBookingConflict(true);
        setErrors({
          general:
            'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác hoặc điều chỉnh thời gian.',
        });
        return;
      }
    }

    if (isSubmitting) return;

    setIsSubmitting(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Refresh availability to check current occupancy before POST
      const preflight = await availability.refresh();
      if (controller.signal.aborted || abortControllerRef.current !== controller) return;

      if (!preflight.success) {
        if (preflight.code === 'ROOM_NOT_AVAILABLE') {
          setIsStaleMaintenance(true);
          setErrors({
            general: preflight.message || 'Phòng vừa được chuyển sang bảo trì, không thể đặt phòng.',
          });
          return;
        }
        setErrors({
          general: preflight.message || 'Không thể kiểm tra lịch trống của phòng. Vui lòng thử lại.',
        });
        return;
      }

      // F1 FIX: Re-validate time rules with fresh timestamp after preflight GET and before POST
      const postValidation = validateBookingSelection(startUtc, endUtc, new Date(), note);
      if (!postValidation.isValid) {
        setErrors(postValidation.errors);
        return;
      }

      // Check slot availability from freshly fetched slots across all covered dates
      const allFreshSlots = coveredDates.flatMap((d) => preflight.data?.[d] || []);
      const rangeCheck = checkRangeAvailability(startUtc!, endUtc!, allFreshSlots);

      if (!rangeCheck.isAvailable) {
        setHasBookingConflict(true);
        setErrors({
          general:
            'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác hoặc điều chỉnh thời gian.',
        });
        return;
      }

      const startIso = startUtc!.toISOString();
      const endIso = endUtc!.toISOString();

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
        setHasBookingConflict(true);
        setErrors({
          general:
            message ||
            'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác hoặc điều chỉnh thời gian.',
        });
        // Refresh availability in background to render newly booked slot as disabled/gray
        availability
          .refresh()
          .then((res) => {
            if (res.success) {
              setHasBookingConflict(false);
            }
          })
          .catch(() => {});
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

  const viewDateSlots = availability.slotsByDate[viewDate] || [];
  const selectedStartIso = isSelectionValid && startUtc ? startUtc.toISOString() : null;
  const selectedEndIso = isSelectionValid && endUtc ? endUtc.toISOString() : null;

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

      {/* Date selector for availability grid */}
      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label htmlFor="booking-view-date" className="form-label">
          Ngày xem lịch <span className="text-muted">(Giờ Việt Nam UTC+7)</span>
        </label>
        <input
          id="booking-view-date"
          type="date"
          className="form-control"
          value={viewDate}
          onChange={handleViewDateChange}
          disabled={isSubmitting}
          data-testid="booking-view-date-input"
        />
      </div>

      {/* Availability TimeGrid Component */}
      {availability.loading && (
        <div className="time-grid-loading" aria-live="polite" style={{ padding: '1rem 0' }}>
          <p className="text-muted" style={{ margin: 0 }}>Đang tải lịch trống của phòng...</p>
        </div>
      )}

      {!availability.loading && availability.error && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem 0' }}>{availability.error}</p>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              availability
                .refresh()
                .then((res) => {
                  if (res.success) {
                    setHasBookingConflict(false);
                  }
                })
                .catch(() => {});
            }}
            data-testid="booking-retry-availability-btn"
          >
            Thử lại
          </button>
        </div>
      )}

      {!availability.loading && !availability.error && (
        <TimeGrid
          slots={viewDateSlots}
          selectedStartTime={selectedStartIso}
          selectedEndTime={selectedEndIso}
          selectingStartTime={selectingStartTime}
          onSelectStart={handleSelectStart}
          onSelectRange={handleSelectRange}
          disabled={isSubmitting}
        />
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
              onChange={handleStartTimeChange}
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
              onChange={handleEndTimeChange}
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
          disabled={isSubmitting || hasBookingConflict || Boolean(availability.error)}
          data-testid="booking-submit-btn"
        >
          {isSubmitting ? 'Đang gửi yêu cầu đặt...' : 'Xác nhận đặt phòng'}
        </button>
      </form>
    </section>
  );
};
