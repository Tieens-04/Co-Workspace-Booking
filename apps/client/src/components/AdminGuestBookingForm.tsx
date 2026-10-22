import React, { useState, useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { AuthContext } from '../context/auth-context-base';
import { useToast } from '../hooks/useToast';
import { roomApi } from '../services/room.api';
import { adminBookingApi } from '../services/admin-booking.api';
import { RoomListItem, RoomAvailabilitySlot } from '../types/room';
import { AdminBookingItem } from '../types/admin-booking';
import { useRoomAvailability } from '../hooks/useRoomAvailability';
import { TimeGrid } from './TimeGrid';
import { GuestBookingSuccess } from './admin/bookings/GuestBookingSuccess';
import { formatCurrency } from '../utils/format';
import { ChevronDown, ChevronUp, CircleAlert, Loader2, UserPlus } from 'lucide-react';
import { ErrorState } from '@/components/common/EmptyState';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Pagination } from '@/components/common/Pagination';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  getVietnamTodayString,
  formatVnDateTimeLocal,
  parseVnDateTimeLocalToUtc,
  getCoveredVnDates,
  calculateEstimatedTotal,
  validateBookingSelection,
  checkRangeAvailability,
} from '../utils/bookingTime';

export interface AdminGuestBookingFormProps {
  onBookingCreated?: (booking: AdminBookingItem) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  principalId?: string;
}

export interface GuestFormErrors {
  guestName?: string;
  guestPhone?: string;
  roomId?: string;
  startTime?: string;
  endTime?: string;
  note?: string;
  general?: string;
}

const FIELDSET_CLASS = 'min-w-0 rounded-lg border p-4 sm:p-5';
const LEGEND_CLASS = '-ml-1.5 px-1.5 text-sm font-semibold';

export const AdminGuestBookingForm: React.FC<AdminGuestBookingFormProps> = ({
  onBookingCreated,
  isOpen,
  onToggleOpen,
  principalId,
}) => {
  const authContext = useContext(AuthContext);
  const { showToast } = useToast();
  const effectivePrincipalId = principalId ?? authContext?.principal?.id;
  const activePrincipalRef = useRef<string | undefined>(effectivePrincipalId);
  activePrincipalRef.current = effectivePrincipalId;

  const onBookingCreatedRef = useRef(onBookingCreated);
  useEffect(() => {
    onBookingCreatedRef.current = onBookingCreated;
  }, [onBookingCreated]);

  // Guest contact state
  const [guestName, setGuestName] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');

  // Room selection state
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [roomPage, setRoomPage] = useState<number>(1);
  const [roomTotalPages, setRoomTotalPages] = useState<number>(1);
  const [isLoadingRooms, setIsLoadingRooms] = useState<boolean>(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<RoomListItem | null>(null);

  // Time & date state
  const [viewDate, setViewDate] = useState<string>(() => getVietnamTodayString());
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [selectingStartTime, setSelectingStartTime] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');

  // Execution state
  const [errors, setErrors] = useState<GuestFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [hasBookingConflict, setHasBookingConflict] = useState<boolean>(false);
  const [isStaleMaintenance, setIsStaleMaintenance] = useState<boolean>(false);
  const [createdBooking, setCreatedBooking] = useState<AdminBookingItem | null>(null);
  const [currentMs, setCurrentMs] = useState<number>(() => Date.now());

  const abortControllerRef = useRef<AbortController | null>(null);

  // Periodic clock update
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMs(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Session change & unmount effect: reset form state and abort pending requests
  useEffect(() => {
    abortControllerRef.current?.abort();

    setGuestName('');
    setGuestPhone('');
    setSelectedRoomId('');
    setSelectedRoom(null);
    setStartTime('');
    setEndTime('');
    setSelectingStartTime(null);
    setNote('');
    setErrors({});
    setIsSubmitting(false);
    setHasBookingConflict(false);
    setIsStaleMaintenance(false);
    setCreatedBooking(null);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [effectivePrincipalId]);

  // Fetch rooms for selector
  const fetchRoomsForSelector = useCallback(async (page: number) => {
    setIsLoadingRooms(true);
    setRoomsError(null);
    try {
      const res = await roomApi.getRooms({ page, limit: 10 });
      if (res.success) {
        setRooms(res.data.items);
        setRoomPage(res.data.pagination.page);
        setRoomTotalPages(res.data.pagination.totalPages);
      } else {
        setRoomsError(res.message || 'Không thể tải danh sách phòng.');
      }
    } catch (err: any) {
      setRoomsError(
        err.response?.data?.message || 'Không thể tải danh sách phòng. Vui lòng thử lại.',
      );
    } finally {
      setIsLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRoomsForSelector(roomPage);
    }
  }, [isOpen, roomPage, fetchRoomsForSelector]);

  // Handle room selection
  const handleRoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rId = e.target.value;
    setSelectedRoomId(rId);
    const found = rooms.find((r) => r.id === rId) || null;
    if (found) {
      setSelectedRoom(found);
    }
    setStartTime('');
    setEndTime('');
    setSelectingStartTime(null);
    setErrors((prev) => ({ ...prev, roomId: undefined, general: undefined }));
    setHasBookingConflict(false);
    setIsStaleMaintenance(false);
    setCreatedBooking(null);
  };

  // Compute parsed UTC instants from wall-clock input values
  const startUtc = useMemo(() => parseVnDateTimeLocalToUtc(startTime), [startTime]);
  const endUtc = useMemo(() => parseVnDateTimeLocalToUtc(endTime), [endTime]);

  // Compute covered dates
  const coveredDates = useMemo(() => {
    if (startUtc && endUtc && endUtc > startUtc) {
      return getCoveredVnDates(startUtc, endUtc);
    }
    return [viewDate];
  }, [startUtc, endUtc, viewDate]);

  const datesToLoad = useMemo(() => {
    return Array.from(new Set([viewDate, ...coveredDates]));
  }, [viewDate, coveredDates]);

  const isAvailabilityEnabled = Boolean(
    isOpen && selectedRoomId && selectedRoom?.status === 'AVAILABLE' && !isStaleMaintenance,
  );

  const availability = useRoomAvailability(selectedRoomId, datesToLoad, isAvailabilityEnabled);

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

  // Selection validity check
  const isSelectionValid = useMemo(() => {
    if (!startUtc || !endUtc || endUtc <= startUtc) return false;
    if (hasBookingConflict || isStaleMaintenance) return false;
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
    isStaleMaintenance,
    availability.loading,
    availability.error,
  ]);

  // Grid callbacks
  const handleSelectStart = useCallback((startIso: string) => {
    setSelectingStartTime(startIso);
    const localStart = formatVnDateTimeLocal(new Date(startIso));
    setStartTime(localStart);
    setEndTime('');
    setErrors((prev) => ({
      ...prev,
      startTime: undefined,
      endTime: undefined,
      general: undefined,
    }));
    setHasBookingConflict(false);
  }, []);

  const handleSelectRange = useCallback((startIso: string, endIso: string) => {
    setSelectingStartTime(null);
    const localStart = formatVnDateTimeLocal(new Date(startIso));
    const localEnd = formatVnDateTimeLocal(new Date(endIso));
    setStartTime(localStart);
    setEndTime(localEnd);
    setErrors((prev) => ({
      ...prev,
      startTime: undefined,
      endTime: undefined,
      general: undefined,
    }));
    setHasBookingConflict(false);
  }, []);

  const handleViewDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setViewDate(newDate);
    setStartTime('');
    setEndTime('');
    setSelectingStartTime(null);
    setErrors({});
    setHasBookingConflict(false);
  };

  // Preview estimation
  const preview = useMemo(() => {
    if (
      !isSelectionValid ||
      !selectedRoom ||
      !startTime ||
      !endTime ||
      !startUtc ||
      !endUtc ||
      endUtc <= startUtc
    ) {
      return null;
    }
    const durationMinutes = (endUtc.getTime() - startUtc.getTime()) / (60 * 1000);
    const hours = durationMinutes / 60;
    const estimatedTotal = calculateEstimatedTotal(selectedRoom.pricePerHour, durationMinutes);
    if (estimatedTotal === null) return null;

    return {
      durationHours: hours,
      durationMinutes,
      estimatedTotal,
    };
  }, [isSelectionValid, selectedRoom, startTime, endTime, startUtc, endUtc]);

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrors({});
    const newErrors: GuestFormErrors = {};

    const trimmedName = guestName.trim();
    if (!trimmedName) {
      newErrors.guestName = 'Tên khách hàng không được để trống';
    } else if (trimmedName.length > 191) {
      newErrors.guestName = 'Tên khách hàng không được vượt quá 191 ký tự';
    }

    const trimmedPhone = guestPhone.trim();
    if (!trimmedPhone) {
      newErrors.guestPhone = 'Số điện thoại không được để trống';
    } else if (trimmedPhone.length > 191) {
      newErrors.guestPhone = 'Số điện thoại không được vượt quá 191 ký tự';
    }

    if (!selectedRoomId) {
      newErrors.roomId = 'Vui lòng chọn phòng làm việc';
    } else if (selectedRoom?.status === 'MAINTENANCE' || isStaleMaintenance) {
      newErrors.roomId = 'Phòng đang bảo trì, không thể đặt phòng';
    }

    if (!startUtc) {
      newErrors.startTime = 'Vui lòng chọn thời gian bắt đầu';
    }
    if (!endUtc) {
      newErrors.endTime = 'Vui lòng chọn thời gian kết thúc';
    }

    if (startUtc && endUtc) {
      const timeCheck = validateBookingSelection(startUtc, endUtc, new Date(currentMs), note);
      if (!timeCheck.isValid) {
        Object.assign(newErrors, timeCheck.errors);
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const initiatingPrincipal = activePrincipalRef.current;

    try {
      // 1. Refresh availability to verify current occupancy
      const preflight = await availability.refresh();
      if (
        controller.signal.aborted ||
        abortControllerRef.current !== controller ||
        activePrincipalRef.current !== initiatingPrincipal
      ) {
        return;
      }

      if (!preflight.success) {
        if (preflight.code === 'ROOM_NOT_AVAILABLE') {
          setIsStaleMaintenance(true);
          setErrors({ general: 'Phòng vừa được chuyển sang bảo trì, không thể đặt phòng.' });
          return;
        }
        setErrors({
          general:
            preflight.message || 'Không thể kiểm tra lịch trống của phòng. Vui lòng thử lại.',
        });
        return;
      }

      // 2. Re-validate time rules with fresh Date() right before POST (guards against slow GET)
      const postValidation = validateBookingSelection(startUtc!, endUtc!, new Date(), note);
      if (!postValidation.isValid) {
        setErrors(postValidation.errors);
        return;
      }

      // 3. Check slot availability from freshly fetched slots
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

      // 4. Send request
      const res = await adminBookingApi.createGuestBooking(
        {
          roomId: selectedRoomId,
          startTime: startUtc!.toISOString(),
          endTime: endUtc!.toISOString(),
          guestName: trimmedName,
          guestPhone: trimmedPhone,
          note: note.trim() === '' ? null : note.trim(),
        },
        controller.signal,
      );

      if (
        controller.signal.aborted ||
        abortControllerRef.current !== controller ||
        activePrincipalRef.current !== initiatingPrincipal
      ) {
        return;
      }

      if (res.success) {
        showToast('Đặt phòng cho khách vãng lai thành công!', 'success');
        setCreatedBooking(res.data);
        onBookingCreatedRef.current?.(res.data);
        // Refresh availability grid
        availability.refresh().catch(() => {});
      }
    } catch (err: any) {
      if (
        controller.signal.aborted ||
        abortControllerRef.current !== controller ||
        activePrincipalRef.current !== initiatingPrincipal
      ) {
        return;
      }

      const code = err.response?.data?.code;
      const message = err.response?.data?.message;
      const details = err.response?.data?.details;

      if (code === 'ROOM_NOT_AVAILABLE') {
        setIsStaleMaintenance(true);
        const msg = message || 'Phòng vừa chuyển sang bảo trì, không thể đặt phòng.';
        setErrors({ general: msg });
        showToast(msg, 'error');
      } else if (code === 'BOOKING_CONFLICT') {
        setHasBookingConflict(true);
        const msg =
          message ||
          'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác hoặc điều chỉnh thời gian.';
        setErrors({
          general: msg,
        });
        showToast(msg, 'error');
        availability.refresh().catch(() => {});
      } else if (code === 'VALIDATION_ERROR' && Array.isArray(details) && details.length > 0) {
        const fieldErrors: GuestFormErrors = {};
        for (const item of details) {
          if (item.field === 'guestName') fieldErrors.guestName = item.message;
          else if (item.field === 'guestPhone') fieldErrors.guestPhone = item.message;
          else if (item.field === 'startTime') fieldErrors.startTime = item.message;
          else if (item.field === 'endTime') fieldErrors.endTime = item.message;
          else if (item.field === 'note') fieldErrors.note = item.message;
          else if (!fieldErrors.general) fieldErrors.general = item.message;
        }
        setErrors(fieldErrors);
        showToast('Dữ liệu nhập không hợp lệ, vui lòng kiểm tra lại.', 'error');
      } else {
        const msg = message || 'Không thể tạo đơn đặt phòng cho khách vãng lai. Vui lòng thử lại.';
        setErrors({
          general: msg,
        });
        showToast(msg, 'error');
      }
    } finally {
      if (
        abortControllerRef.current === controller &&
        activePrincipalRef.current === initiatingPrincipal
      ) {
        abortControllerRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  const handleResetForNewGuest = () => {
    setCreatedBooking(null);
    setGuestName('');
    setGuestPhone('');
    setStartTime('');
    setEndTime('');
    setSelectingStartTime(null);
    setNote('');
    setErrors({});
    setHasBookingConflict(false);
  };

  return (
    <Card className="gap-0 py-0">
      <div
        className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"
        onClick={onToggleOpen}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
          >
            <UserPlus className="size-4" />
          </span>
          <h2 id="guest-booking-title" className="text-lg leading-snug font-semibold sm:text-h3">
            Đặt Phòng Hộ Khách Vãng Lai
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggleOpen();
          }}
          aria-expanded={isOpen}
          aria-controls="guest-booking-panel"
          data-testid="toggle-guest-form-btn"
        >
          {isOpen ? 'Thu gọn' : 'Mở biểu mẫu'}
          {isOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </Button>
      </div>

      {isOpen && (
        <div id="guest-booking-panel" className="border-t px-5 py-5 sm:px-6 sm:py-6">
          {createdBooking ? (
            <GuestBookingSuccess
              booking={createdBooking}
              onCreateAnother={handleResetForNewGuest}
            />
          ) : (
            <form onSubmit={handleSubmit} noValidate className="grid gap-6">
              {errors.general && (
                <Alert variant="destructive" data-testid="guest-booking-error-general">
                  <CircleAlert aria-hidden="true" />
                  <AlertDescription>{errors.general}</AlertDescription>
                </Alert>
              )}

              {/* Guest Information */}
              <fieldset className={FIELDSET_CLASS}>
                <legend className={LEGEND_CLASS}>Thông tin khách vãng lai</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    id="guestName"
                    label={
                      <>
                        Họ và tên khách <span className="text-destructive">*</span>
                      </>
                    }
                    error={errors.guestName}
                  >
                    <Input
                      type="text"
                      value={guestName}
                      onChange={(e) => {
                        setGuestName(e.target.value);
                        if (errors.guestName)
                          setErrors((prev) => ({ ...prev, guestName: undefined }));
                      }}
                      placeholder="Ví dụ: Nguyễn Văn A"
                      maxLength={191}
                      disabled={isSubmitting}
                      data-testid="guest-name-input"
                    />
                  </Field>

                  <Field
                    id="guestPhone"
                    label={
                      <>
                        Số điện thoại <span className="text-destructive">*</span>
                      </>
                    }
                    error={errors.guestPhone}
                  >
                    <Input
                      type="tel"
                      className="tabular-nums"
                      value={guestPhone}
                      onChange={(e) => {
                        setGuestPhone(e.target.value);
                        if (errors.guestPhone)
                          setErrors((prev) => ({ ...prev, guestPhone: undefined }));
                      }}
                      placeholder="Ví dụ: 0912345678"
                      maxLength={191}
                      disabled={isSubmitting}
                      data-testid="guest-phone-input"
                    />
                  </Field>
                </div>
              </fieldset>

              {/* Room Selection */}
              <fieldset className={FIELDSET_CLASS}>
                <legend className={LEGEND_CLASS}>Chọn phòng làm việc</legend>
                <div className="grid gap-3">
                  <Field
                    id="selectedRoomId"
                    label={
                      <>
                        Phòng <span className="text-destructive">*</span>
                      </>
                    }
                    error={errors.roomId}
                  >
                    <NativeSelect
                      value={selectedRoomId}
                      onChange={handleRoomChange}
                      disabled={isSubmitting || isLoadingRooms}
                      data-testid="guest-room-select"
                    >
                      <option value="">-- Chọn phòng --</option>
                      {/* Include currently selected room if it was paged out */}
                      {selectedRoom && !rooms.some((r) => r.id === selectedRoom.id) && (
                        <option
                          key={selectedRoom.id}
                          value={selectedRoom.id}
                          disabled={selectedRoom.status === 'MAINTENANCE'}
                        >
                          {selectedRoom.name} - {formatCurrency(selectedRoom.pricePerHour)}/h (
                          {selectedRoom.capacity} người)
                          {selectedRoom.status === 'MAINTENANCE' ? ' (Đang bảo trì)' : ''}
                        </option>
                      )}
                      {rooms.map((room) => (
                        <option
                          key={room.id}
                          value={room.id}
                          disabled={room.status === 'MAINTENANCE'}
                        >
                          {room.name} - {formatCurrency(room.pricePerHour)}/h ({room.capacity}{' '}
                          người)
                          {room.status === 'MAINTENANCE' ? ' (Đang bảo trì)' : ''}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  {roomsError && (
                    <ErrorState
                      className="p-4"
                      data-testid="guest-rooms-error"
                      title={roomsError}
                      onRetry={() => fetchRoomsForSelector(roomPage)}
                      retryTestId="guest-retry-rooms-btn"
                    />
                  )}

                  {roomTotalPages > 1 && (
                    <Pagination
                      ariaLabel="Phân trang danh sách phòng"
                      page={roomPage}
                      totalPages={roomTotalPages}
                      disabled={isLoadingRooms}
                      onPageChange={(nextPage) => setRoomPage(Math.max(1, nextPage))}
                      className="border-t-0 pt-0"
                    />
                  )}
                </div>
              </fieldset>

              {/* Date & Time Selection */}
              {selectedRoomId && selectedRoom?.status === 'AVAILABLE' && (
                <fieldset className={FIELDSET_CLASS}>
                  <legend className={LEGEND_CLASS}>Thời gian sử dụng (Giờ Việt Nam)</legend>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field id="viewDate" label="Xem lịch ngày">
                      <Input
                        type="date"
                        className="tabular-nums"
                        value={viewDate}
                        onChange={handleViewDateChange}
                        disabled={isSubmitting}
                        data-testid="guest-view-date-input"
                      />
                    </Field>

                    <Field
                      id="guestStartTime"
                      label={
                        <>
                          Bắt đầu (Giờ VN) <span className="text-destructive">*</span>
                        </>
                      }
                      error={errors.startTime}
                    >
                      <Input
                        type="datetime-local"
                        step={1800}
                        className="tabular-nums"
                        value={startTime}
                        onChange={(e) => {
                          setStartTime(e.target.value);
                          setSelectingStartTime(null);
                          if (errors.startTime)
                            setErrors((prev) => ({ ...prev, startTime: undefined }));
                        }}
                        disabled={isSubmitting}
                        data-testid="guest-start-time-input"
                      />
                    </Field>

                    <Field
                      id="guestEndTime"
                      label={
                        <>
                          Kết thúc (Giờ VN) <span className="text-destructive">*</span>
                        </>
                      }
                      error={errors.endTime}
                    >
                      <Input
                        type="datetime-local"
                        step={1800}
                        className="tabular-nums"
                        value={endTime}
                        onChange={(e) => {
                          setEndTime(e.target.value);
                          setSelectingStartTime(null);
                          if (errors.endTime)
                            setErrors((prev) => ({ ...prev, endTime: undefined }));
                        }}
                        disabled={isSubmitting}
                        data-testid="guest-end-time-input"
                      />
                    </Field>
                  </div>

                  {/* TimeGrid Component */}
                  <div className="mt-5">
                    {availability.loading && (
                      <div
                        aria-live="polite"
                        className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
                        data-testid="guest-availability-loading"
                      >
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                        <p>Đang tải lịch trống của phòng...</p>
                      </div>
                    )}

                    {!availability.loading && availability.error && (
                      <ErrorState
                        className="p-4"
                        data-testid="guest-availability-error"
                        title={availability.error}
                        retryTestId="guest-retry-availability-btn"
                        onRetry={() => {
                          availability
                            .refresh()
                            .then((res) => {
                              if (res.success) {
                                setHasBookingConflict(false);
                              }
                            })
                            .catch(() => {});
                        }}
                      />
                    )}

                    {!availability.loading && !availability.error && (
                      <div className="grid gap-3">
                        <p className="text-sm text-muted-foreground">
                          Bấm vào khung giờ để chọn bắt đầu, sau đó bấm khung giờ kết thúc (bước 30
                          phút, tối thiểu 1h, tối đa 8h):
                        </p>
                        <TimeGrid
                          slots={availability.slotsByDate[viewDate] || []}
                          selectedStartTime={startUtc ? startUtc.toISOString() : null}
                          selectedEndTime={endUtc ? endUtc.toISOString() : null}
                          selectingStartTime={selectingStartTime}
                          onSelectStart={handleSelectStart}
                          onSelectRange={handleSelectRange}
                          disabled={isSubmitting || availability.loading}
                        />
                      </div>
                    )}
                  </div>

                  {/* Summary / Price Preview */}
                  {preview && (
                    <div
                      className="mt-5 flex animate-rise flex-wrap items-end justify-between gap-4 rounded-lg border border-l-2 border-l-primary bg-primary/[0.05] px-4 py-3"
                      data-testid="guest-booking-price-preview"
                    >
                      <p className="text-sm text-muted-foreground tabular-nums">
                        Thời lượng:{' '}
                        <strong className="font-semibold text-foreground">
                          {preview.durationHours} giờ
                        </strong>{' '}
                        ({preview.durationMinutes} phút)
                      </p>
                      <p className="flex items-baseline gap-2 text-sm text-muted-foreground">
                        Tạm tính:{' '}
                        <strong className="text-xl leading-none font-bold text-foreground tabular-nums">
                          {formatCurrency(preview.estimatedTotal)}
                        </strong>
                      </p>
                    </div>
                  )}
                </fieldset>
              )}

              {/* Note */}
              <Field id="guestNote" label="Ghi chú (tối đa 500 ký tự)" error={errors.note}>
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="Ghi chú thêm (không bắt buộc)..."
                  disabled={isSubmitting}
                  data-testid="guest-note-input"
                />
              </Field>

              {/* Submit Button */}
              <div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={
                    isSubmitting ||
                    selectedRoom?.status === 'MAINTENANCE' ||
                    Boolean(availability.error) ||
                    availability.loading
                  }
                  aria-busy={isSubmitting || availability.loading || undefined}
                  data-testid="guest-submit-btn"
                >
                  {(isSubmitting || availability.loading) && (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  )}
                  {availability.loading
                    ? 'Đang kiểm tra lịch trống...'
                    : isSubmitting
                      ? 'Đang xử lý...'
                      : 'Xác nhận đặt phòng vãng lai'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
};
