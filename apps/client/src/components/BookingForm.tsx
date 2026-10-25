import React, { useState, useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { bookingApi } from '../services/booking.api';
import { RoomStatus, RoomAvailabilitySlot } from '../types/room';
import { formatVnd, formatCurrency } from '../utils/format';
import { useRoomAvailability } from '../hooks/useRoomAvailability';
import { AuthContext } from '../context/auth-context-base';
import { useToast } from '../hooks/useToast';
import { TimeGrid } from './TimeGrid';
import {
  getVietnamTodayString,
  formatVnDateTimeLocal,
  parseVnDateTimeLocalToUtc,
  formatVnDate,
  calculateEstimatedTotal,
  validateBookingSelection,
  checkRangeAvailability,
} from '../utils/bookingTime';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleAlert,
  Clock,
  Info,
  LoaderCircle,
  LogIn,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Notice } from './booking/Notice';
import { DetailList, DetailRow } from './booking/DetailList';
import { SwapValue } from './motion/SwapValue';

export interface BookingFormProps {
  roomId: string;
  roomName: string;
  roomStatus: RoomStatus;
  pricePerHour: string;
  isAuthenticated: boolean;
  userRole?: string | null;
  userId?: string;
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
  userId,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const currentUserId = userId || auth?.principal?.id;
  const { showToast } = useToast();

  const [phase, setPhase] = useState<'edit' | 'review'>('edit');
  const [reviewedSnapshot, setReviewedSnapshot] = useState<{
    durationHours: number;
    durationMinutes: number;
    estimatedTotal: string;
  } | null>(null);
  const [viewDate, setViewDate] = useState<string>(() => getVietnamTodayString());
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [selectingStartTime, setSelectingStartTime] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');
  const [errors, setErrors] = useState<BookingFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isStaleMaintenance, setIsStaleMaintenance] = useState<boolean>(false);
  const [hasBookingConflict, setHasBookingConflict] = useState<boolean>(false);
  // Presentation only: the picked slot was taken by someone else after it was shown as free
  // (preflight refresh or 409 BOOKING_CONFLICT). Cleared as soon as the selection changes.
  const [slotJustTaken, setSlotJustTaken] = useState<boolean>(false);
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

  // Availability is loaded only for the selected Vietnam day.
  const coveredDates = useMemo(() => {
    if (startUtc && endUtc && endUtc > startUtc) {
      return [formatVnDate(startUtc)];
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
    setPhase('edit');
    setReviewedSnapshot(null);
    setIsStaleMaintenance(false);
    setHasBookingConflict(false);
    setSlotJustTaken(false);

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
    setSlotJustTaken(false);
  };

  // Handle manual start time input change
  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStartTime(val);
    setSelectingStartTime(null);
    setHasBookingConflict(false);
    setSlotJustTaken(false);
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
    setSlotJustTaken(false);
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
    setSlotJustTaken(false);
  }, []);

  const handleSelectRange = useCallback((startIso: string, endIso: string) => {
    setSelectingStartTime(null);
    const localStart = formatVnDateTimeLocal(new Date(startIso));
    const localEnd = formatVnDateTimeLocal(new Date(endIso));
    setStartTime(localStart);
    setEndTime(localEnd);
    setErrors({});
    setHasBookingConflict(false);
    setSlotJustTaken(false);
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
      <section className={PANEL_CLASS} data-testid="booking-guest-prompt">
        <PanelHeader title="Đặt Không Gian Làm Việc" />
        <p className="text-sm text-muted-foreground">
          Vui lòng đăng nhập tài khoản khách hàng để đặt phòng này.
        </p>
        <Button asChild size="lg" className="w-full">
          <Link to="/login" state={{ from: location.pathname }} data-testid="booking-login-link">
            <LogIn aria-hidden="true" />
            Đăng nhập để đặt phòng
          </Link>
        </Button>
        <BookingRules />
      </section>
    );
  }

  // If user has ADMIN role
  if (userRole === 'ADMIN') {
    return (
      <section className={PANEL_CLASS} data-testid="booking-admin-notice">
        <PanelHeader title="Đặt Không Gian Làm Việc" />
        <Notice tone="info" icon={ShieldCheck}>
          Tài khoản Quản trị viên không thể đặt phòng qua biểu mẫu khách hàng. Vui lòng sử dụng tài
          khoản Khách hàng.
        </Notice>
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
      <section className={PANEL_CLASS} data-testid="booking-maintenance-box">
        <PanelHeader title="Đặt Không Gian Làm Việc" />
        <Notice tone="maintenance" role="alert">
          Phòng này đang trong trạng thái <strong className="font-semibold">Bảo trì</strong> và hiện
          không thể tiếp nhận đặt chỗ mới.
        </Notice>
      </section>
    );
  }

  const handleProceedToReview = (e: React.FormEvent) => {
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

    const validation = validateBookingSelection(startUtc, endUtc, new Date(currentMs), note);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Require availability to be fully loaded before entering review
    if (availability.loading || !allLoadedCoveredSlots) {
      setErrors({
        general: 'Đang tải dữ liệu lịch trống của phòng, vui lòng đợi trong giây lát.',
      });
      return;
    }

    // Check against currently loaded slots first to avoid unnecessary step if already known booked
    const currentRangeCheck = checkRangeAvailability(startUtc!, endUtc!, allLoadedCoveredSlots);
    if (!currentRangeCheck.isAvailable) {
      setHasBookingConflict(true);
      setErrors({
        general:
          'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác hoặc điều chỉnh thời gian.',
      });
      return;
    }

    if (!preview) {
      setErrors({
        general: 'Không thể tính toán thời lượng và giá tạm tính. Vui lòng kiểm tra lại thời gian.',
      });
      return;
    }

    setReviewedSnapshot({
      durationHours: preview.durationHours,
      durationMinutes: preview.durationMinutes,
      estimatedTotal: preview.estimatedTotal,
    });
    setPhase('review');
  };

  const handleFinalSubmit = async () => {
    if (isSubmitting) return;

    setErrors({});
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
            general:
              preflight.message || 'Phòng vừa được chuyển sang bảo trì, không thể đặt phòng.',
          });
          return;
        }
        setErrors({
          general:
            preflight.message || 'Không thể kiểm tra lịch trống của phòng. Vui lòng thử lại.',
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
        setSlotJustTaken(true);
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
        showToast('Đặt phòng thành công! Email xác nhận đã được gửi.', 'success');
        navigate('/booking-confirmation', {
          state: {
            booking: res.data,
            customerId: currentUserId,
          },
        });
      }
    } catch (err: any) {
      if (controller.signal.aborted || abortControllerRef.current !== controller) return;

      const code = err.response?.data?.code;
      const message = err.response?.data?.message;
      const details = err.response?.data?.details;

      if (code === 'ROOM_NOT_AVAILABLE') {
        setIsStaleMaintenance(true);
        const msg = message || 'Phòng vừa được chuyển sang bảo trì, không thể đặt phòng.';
        setErrors({
          general: msg,
        });
        showToast(msg, 'error');
      } else if (code === 'BOOKING_CONFLICT') {
        setHasBookingConflict(true);
        setSlotJustTaken(true);
        const msg =
          message ||
          'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác hoặc điều chỉnh thời gian.';
        setErrors({
          general: msg,
        });
        showToast(msg, 'error');
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

  const handleBackToEdit = () => {
    setPhase('edit');
    setReviewedSnapshot(null);
    setErrors({});
  };

  // If in review phase, render review card
  if (phase === 'review') {
    return (
      <section
        className={PANEL_CLASS}
        data-testid="booking-review-section"
        aria-labelledby="booking-review-heading"
      >
        <PanelHeader
          eyebrow="Bước 2 / 2"
          title="Xác Nhận Thông Tin Đặt Phòng"
          titleId="booking-review-heading"
          description="Vui lòng kiểm tra lại toàn bộ thông tin trước khi gửi yêu cầu đặt chỗ."
        />

        {errors.general && (
          <Notice tone="error" role="alert" data-testid="booking-general-error">
            {slotJustTaken ? (
              <div className="grid gap-1.5">
                <p className="font-semibold">Khung giờ vừa có người khác đặt trước</p>
                <p>{errors.general}</p>
                <p className="text-[0.8125rem]">
                  Lịch trống được tải lại để hiển thị khung vừa bị đặt. Ngày xem lịch và ghi chú của
                  bạn vẫn được giữ — hãy chọn một khung giờ khác.
                </p>
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleBackToEdit}
                    disabled={isSubmitting}
                    data-testid="booking-conflict-repick-btn"
                  >
                    <CalendarClock aria-hidden="true" />
                    Chọn khung giờ khác
                  </Button>
                </div>
              </div>
            ) : (
              <p>{errors.general}</p>
            )}
          </Notice>
        )}

        {errors.startTime && (
          <Notice tone="error" role="alert" data-testid="error-booking-start">
            {errors.startTime}
          </Notice>
        )}

        {errors.endTime && (
          <Notice tone="error" role="alert" data-testid="error-booking-end">
            {errors.endTime}
          </Notice>
        )}

        {errors.note && (
          <Notice tone="error" role="alert" data-testid="error-booking-note">
            {errors.note}
          </Notice>
        )}

        <DetailList layout="split">
          <DetailRow label="Phòng làm việc">
            <strong className="font-semibold" data-testid="review-room-name">
              {roomName}
            </strong>
          </DetailRow>

          <DetailRow label="Thời gian bắt đầu" valueClassName="tabular-nums">
            <span data-testid="review-start-time">
              {startUtc
                ? new Date(startUtc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                : ''}
            </span>
          </DetailRow>

          <DetailRow label="Thời gian kết thúc" valueClassName="tabular-nums">
            <span data-testid="review-end-time">
              {endUtc
                ? new Date(endUtc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                : ''}
            </span>
          </DetailRow>

          <DetailRow label="Thời lượng đặt" valueClassName="tabular-nums">
            <span data-testid="review-duration">
              {(reviewedSnapshot ?? preview)?.durationHours} giờ (
              {(reviewedSnapshot ?? preview)?.durationMinutes} phút)
            </span>
          </DetailRow>

          <DetailRow label="Đơn giá" valueClassName="tabular-nums">
            <span data-testid="review-price-per-hour">{formatVnd(pricePerHour)}</span>
          </DetailRow>

          <DetailRow label="Ghi chú" valueClassName="font-normal">
            <span className="whitespace-pre-line" data-testid="review-note">
              {note.trim() !== '' ? note.trim() : 'Không có'}
            </span>
          </DetailRow>

          <DetailRow
            label={<span className="font-semibold text-foreground">Tổng tiền ước tính</span>}
            className="py-4"
          >
            <strong
              className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] tabular-nums"
              data-testid="review-estimated-total"
            >
              {(reviewedSnapshot ?? preview)
                ? formatCurrency((reviewedSnapshot ?? preview)!.estimatedTotal)
                : ''}
            </strong>
          </DetailRow>
        </DetailList>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          Tổng tiền do hệ thống tính lại khi xác nhận.
        </p>

        <div className="grid gap-2 @sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleBackToEdit}
            disabled={isSubmitting}
            data-testid="booking-back-btn"
          >
            <ArrowLeft aria-hidden="true" />
            Quay lại chỉnh sửa
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={handleFinalSubmit}
            disabled={isSubmitting || hasBookingConflict}
            aria-busy={isSubmitting || undefined}
            data-testid="booking-confirm-btn"
          >
            {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {isSubmitting ? 'Đang gửi yêu cầu đặt...' : 'Xác nhận đặt phòng'}
          </Button>
        </div>
      </section>
    );
  }

  const viewDateSlots = availability.slotsByDate[viewDate] || [];
  const selectedStartIso = isSelectionValid && startUtc ? startUtc.toISOString() : null;
  const selectedEndIso = isSelectionValid && endUtc ? endUtc.toISOString() : null;

  return (
    <section
      className={PANEL_CLASS}
      data-testid="customer-booking-form"
      aria-labelledby="booking-form-heading"
    >
      <PanelHeader
        eyebrow="Bước 1 / 2"
        title="Đặt Không Gian Làm Việc"
        titleId="booking-form-heading"
        aside={
          <p className="text-right text-sm leading-tight">
            <span className="block font-bold tabular-nums">{formatVnd(pricePerHour)}</span>
            <span className="text-xs text-muted-foreground">Đơn giá</span>
          </p>
        }
      />

      {errors.general && (
        <Notice tone="error" role="alert" data-testid="booking-general-error">
          <p>{errors.general}</p>
        </Notice>
      )}

      {slotJustTaken && !errors.general && (
        <Notice tone="warning" role="status" data-testid="booking-conflict-hint">
          <p className="font-semibold">Khung giờ bạn chọn vừa có người khác đặt trước.</p>
          <p className="mt-0.5">
            Các ô gạch chéo là khung đã đặt. Ngày và ghi chú của bạn vẫn được giữ — hãy chọn một
            khung giờ khác.
          </p>
        </Notice>
      )}

      {/* Date selector for availability grid */}
      <div className="grid gap-1.5">
        <Label htmlFor="booking-view-date" className="text-sm font-medium">
          Ngày xem lịch{' '}
          <span className="font-normal text-muted-foreground">(Giờ Việt Nam UTC+7)</span>
        </Label>
        <Input
          id="booking-view-date"
          type="date"
          className="tabular-nums"
          value={viewDate}
          onChange={handleViewDateChange}
          disabled={isSubmitting}
          data-testid="booking-view-date-input"
        />
      </div>

      {/* Availability TimeGrid Component */}
      {availability.loading && (
        <div className="grid gap-3" aria-live="polite" data-testid="booking-availability-loading">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Đang tải lịch trống của phòng...
          </p>
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1.5 rounded-lg border bg-background p-2"
            aria-hidden="true"
          >
            {Array.from({ length: 16 }, (_, i) => (
              <Skeleton key={i} className="h-9 rounded-md" />
            ))}
          </div>
        </div>
      )}

      {!availability.loading && availability.error && (
        <Notice tone="error" role="alert">
          <p>{availability.error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
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
            <RotateCw aria-hidden="true" />
            Thử lại
          </Button>
        </Notice>
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

      <form
        onSubmit={handleProceedToReview}
        noValidate
        aria-busy={isSubmitting}
        className="grid gap-4"
      >
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">hoặc nhập giờ chính xác</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-4 @md:grid-cols-2">
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="booking-start-time" className="text-sm font-medium">
              Thời gian bắt đầu <span className="text-destructive">*</span>
            </Label>
            <Input
              id="booking-start-time"
              type="datetime-local"
              step={1800}
              className="tabular-nums"
              value={startTime}
              onChange={handleStartTimeChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.startTime)}
              aria-describedby={errors.startTime ? 'error-booking-start' : undefined}
              data-testid="booking-start-input"
            />
            {errors.startTime && (
              <FieldError id="error-booking-start" testId="error-booking-start">
                {errors.startTime}
              </FieldError>
            )}
          </div>

          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="booking-end-time" className="text-sm font-medium">
              Thời gian kết thúc <span className="text-destructive">*</span>
            </Label>
            <Input
              id="booking-end-time"
              type="datetime-local"
              step={1800}
              min={`${startTime.split('T')[0] || viewDate}T07:00`}
              max={`${startTime.split('T')[0] || viewDate}T22:00`}
              className="tabular-nums"
              value={endTime}
              onChange={handleEndTimeChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.endTime)}
              aria-describedby={errors.endTime ? 'error-booking-end' : undefined}
              data-testid="booking-end-input"
            />
            {errors.endTime && (
              <FieldError id="error-booking-end" testId="error-booking-end">
                {errors.endTime}
              </FieldError>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="booking-note" className="text-sm font-medium">
              Ghi chú đặt phòng
            </Label>
            <span className="text-xs text-muted-foreground tabular-nums">{note.length}/500</span>
          </div>
          <Textarea
            id="booking-note"
            rows={2}
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
            <FieldError id="error-booking-note" testId="error-booking-note">
              {errors.note}
            </FieldError>
          )}
        </div>

        {/* Display-only price & duration preview */}
        {preview ? (
          <DetailList layout="split" data-testid="booking-price-preview">
            <DetailRow label="Thời lượng đặt" valueClassName="tabular-nums">
              <strong className="font-semibold">{preview.durationHours} giờ</strong>
            </DetailRow>
            <DetailRow label="Đơn giá" valueClassName="tabular-nums">
              <span>{formatVnd(pricePerHour)}</span>
            </DetailRow>
            <DetailRow
              label={<span className="font-semibold text-foreground">Ước tính tổng tiền</span>}
              className="py-4"
            >
              <span className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] tabular-nums">
                <SwapValue value={preview.estimatedTotal}>
                  {formatCurrency(preview.estimatedTotal)}
                </SwapValue>
              </span>
            </DetailRow>
          </DetailList>
        ) : (
          <p
            className="rounded-lg border border-dashed border-input px-4 py-3 text-sm text-muted-foreground"
            data-testid="booking-price-placeholder"
          >
            Chọn giờ bắt đầu và kết thúc để xem thời lượng và tổng tiền ước tính.
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting || hasBookingConflict || Boolean(availability.error)}
          data-testid="booking-submit-btn"
        >
          {availability.loading && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {availability.loading ? 'Đang kiểm tra lịch trống...' : 'Tiếp tục xem lại thông tin'}
        </Button>
      </form>

      <BookingRules />
    </section>
  );
};

const PANEL_CLASS =
  '@container grid gap-5 rounded-xl border bg-card p-5 text-card-foreground shadow-soft sm:p-6';

interface PanelHeaderProps {
  title: string;
  titleId?: string;
  eyebrow?: string;
  description?: string;
  aside?: React.ReactNode;
}

const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  titleId,
  eyebrow,
  description,
  aside,
}) => (
  <div className="flex items-start justify-between gap-4 border-b pb-4">
    <div className="grid min-w-0 gap-1.5">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 id={titleId} className="text-h3 font-bold">
        {title}
      </h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
    {aside && <div className="shrink-0">{aside}</div>}
  </div>
);

const FieldError: React.FC<{ id: string; testId: string; children: React.ReactNode }> = ({
  id,
  testId,
  children,
}) => (
  <p
    id={id}
    className="flex items-start gap-1.5 text-[0.8125rem] text-destructive"
    data-testid={testId}
  >
    <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
    <span>{children}</span>
  </p>
);

const BOOKING_RULES = [
  { icon: Clock, text: 'Giờ hoạt động: 07:00–22:00, đặt trong cùng ngày (giờ Việt Nam)' },
  { icon: Clock, text: 'Đặt trước ít nhất 30 phút, 1 đến 8 giờ mỗi lượt' },
  { icon: Info, text: 'Tự hủy được khi còn ít nhất 1 giờ trước giờ bắt đầu' },
  { icon: Check, text: 'Tổng tiền do hệ thống tính lại khi xác nhận' },
];

const BookingRules: React.FC = () => (
  <ul className="grid gap-1.5 border-t pt-4 text-xs text-muted-foreground">
    {BOOKING_RULES.map(({ icon: Icon, text }) => (
      <li key={text} className="flex items-center gap-2">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {text}
      </li>
    ))}
  </ul>
);
