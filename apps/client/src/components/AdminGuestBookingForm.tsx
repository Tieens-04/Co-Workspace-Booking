import React, { useState, useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { AuthContext } from '../context/auth-context-base';
import { useToast } from '../hooks/useToast';
import { roomApi } from '../services/room.api';
import { adminBookingApi } from '../services/admin-booking.api';
import { RoomListItem, RoomAvailabilitySlot } from '../types/room';
import { AdminBookingItem } from '../types/admin-booking';
import { useRoomAvailability } from '../hooks/useRoomAvailability';
import { TimeGrid } from './TimeGrid';
import { BookingSummary } from './BookingSummary';
import { formatCurrency } from '../utils/format';
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
    <section className="card admin-guest-booking-section" style={{ marginBottom: '2rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={onToggleOpen}
      >
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>➕ Đặt Phòng Hộ Khách Vãng Lai</h2>
        <button
          type="button"
          className="btn btn-outline"
          onClick={(e) => {
            e.stopPropagation();
            onToggleOpen();
          }}
          data-testid="toggle-guest-form-btn"
        >
          {isOpen ? 'Thu gọn ▲' : 'Mở biểu mẫu ▼'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '1.5rem' }}>
          {createdBooking ? (
            <div
              className="alert alert-success"
              role="status"
              data-testid="guest-booking-success-box"
            >
              <h3 style={{ marginTop: 0 }}>🎉 Đặt phòng cho khách vãng lai thành công!</h3>
              <p>
                Khách hàng: <strong>{createdBooking.customer.name}</strong> (
                {createdBooking.customer.phone})
              </p>
              <div
                style={{
                  background: '#fff',
                  padding: '1rem',
                  borderRadius: '6px',
                  margin: '1rem 0',
                }}
              >
                <BookingSummary
                  booking={{
                    id: createdBooking.id,
                    bookingCode: createdBooking.bookingCode,
                    room: createdBooking.room,
                    startTime: createdBooking.startTime,
                    endTime: createdBooking.endTime,
                    totalAmount: createdBooking.totalAmount,
                    note: createdBooking.note,
                    status: createdBooking.status,
                    paymentStatus: createdBooking.paymentStatus,
                    paymentMethod: createdBooking.paymentMethod,
                  }}
                  showPaymentDetails={true}
                  showNote={true}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleResetForNewGuest}
                data-testid="create-another-guest-booking-btn"
              >
                + Đặt đơn khác cho khách vãng lai
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {errors.general && (
                <div
                  className="alert alert-danger"
                  role="alert"
                  data-testid="guest-booking-error-general"
                  style={{ marginBottom: '1rem' }}
                >
                  {errors.general}
                </div>
              )}

              {/* Guest Information */}
              <fieldset
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <legend style={{ fontWeight: 'bold', padding: '0 0.5rem' }}>
                  Thông tin khách vãng lai
                </legend>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <label
                      htmlFor="guestName"
                      style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
                    >
                      Họ và tên khách <span style={{ color: 'red' }}>*</span>
                    </label>
                    <input
                      id="guestName"
                      type="text"
                      className="form-control"
                      value={guestName}
                      onChange={(e) => {
                        setGuestName(e.target.value);
                        if (errors.guestName)
                          setErrors((prev) => ({ ...prev, guestName: undefined }));
                      }}
                      placeholder="Ví dụ: Nguyễn Văn A"
                      maxLength={191}
                      aria-invalid={Boolean(errors.guestName)}
                      aria-describedby={errors.guestName ? 'guestName-error' : undefined}
                      disabled={isSubmitting}
                      data-testid="guest-name-input"
                    />
                    {errors.guestName && (
                      <span
                        id="guestName-error"
                        className="error-text"
                        role="alert"
                        style={{ color: 'red', fontSize: '0.85rem' }}
                      >
                        {errors.guestName}
                      </span>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="guestPhone"
                      style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
                    >
                      Số điện thoại <span style={{ color: 'red' }}>*</span>
                    </label>
                    <input
                      id="guestPhone"
                      type="tel"
                      className="form-control"
                      value={guestPhone}
                      onChange={(e) => {
                        setGuestPhone(e.target.value);
                        if (errors.guestPhone)
                          setErrors((prev) => ({ ...prev, guestPhone: undefined }));
                      }}
                      placeholder="Ví dụ: 0912345678"
                      maxLength={191}
                      aria-invalid={Boolean(errors.guestPhone)}
                      aria-describedby={errors.guestPhone ? 'guestPhone-error' : undefined}
                      disabled={isSubmitting}
                      data-testid="guest-phone-input"
                    />
                    {errors.guestPhone && (
                      <span
                        id="guestPhone-error"
                        className="error-text"
                        role="alert"
                        style={{ color: 'red', fontSize: '0.85rem' }}
                      >
                        {errors.guestPhone}
                      </span>
                    )}
                  </div>
                </div>
              </fieldset>

              {/* Room Selection */}
              <fieldset
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <legend style={{ fontWeight: 'bold', padding: '0 0.5rem' }}>
                  Chọn phòng làm việc
                </legend>
                <div>
                  <label
                    htmlFor="selectedRoomId"
                    style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
                  >
                    Phòng <span style={{ color: 'red' }}>*</span>
                  </label>
                  <select
                    id="selectedRoomId"
                    className="form-control"
                    value={selectedRoomId}
                    onChange={handleRoomChange}
                    aria-invalid={Boolean(errors.roomId)}
                    aria-describedby={errors.roomId ? 'selectedRoomId-error' : undefined}
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
                        {room.name} - {formatCurrency(room.pricePerHour)}/h ({room.capacity} người)
                        {room.status === 'MAINTENANCE' ? ' (Đang bảo trì)' : ''}
                      </option>
                    ))}
                  </select>
                  {errors.roomId && (
                    <span
                      id="selectedRoomId-error"
                      className="error-text"
                      role="alert"
                      style={{ color: 'red', fontSize: '0.85rem' }}
                    >
                      {errors.roomId}
                    </span>
                  )}
                  {roomsError && (
                    <div
                      className="alert alert-danger"
                      role="alert"
                      style={{
                        marginTop: '0.5rem',
                        marginBottom: '0.5rem',
                        padding: '0.5rem 0.75rem',
                      }}
                      data-testid="guest-rooms-error"
                    >
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>{roomsError}</p>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.85rem' }}
                        data-testid="guest-retry-rooms-btn"
                        onClick={() => fetchRoomsForSelector(roomPage)}
                      >
                        Thử lại
                      </button>
                    </div>
                  )}
                  {roomTotalPages > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                        marginTop: '0.5rem',
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.85rem' }}
                        disabled={roomPage <= 1 || isLoadingRooms}
                        onClick={() => setRoomPage((p) => Math.max(1, p - 1))}
                      >
                        ← Trang trước
                      </button>
                      <span style={{ fontSize: '0.85rem' }}>
                        Trang {roomPage} / {roomTotalPages}
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.85rem' }}
                        disabled={roomPage >= roomTotalPages || isLoadingRooms}
                        onClick={() => setRoomPage((p) => p + 1)}
                      >
                        Trang sau →
                      </button>
                    </div>
                  )}
                </div>
              </fieldset>

              {/* Date & Time Selection */}
              {selectedRoomId && selectedRoom?.status === 'AVAILABLE' && (
                <fieldset
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                  }}
                >
                  <legend style={{ fontWeight: 'bold', padding: '0 0.5rem' }}>
                    Thời gian sử dụng (Giờ Việt Nam)
                  </legend>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '1rem',
                      marginBottom: '1rem',
                    }}
                  >
                    <div>
                      <label
                        htmlFor="viewDate"
                        style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
                      >
                        Xem lịch ngày
                      </label>
                      <input
                        id="viewDate"
                        type="date"
                        className="form-control"
                        value={viewDate}
                        onChange={handleViewDateChange}
                        disabled={isSubmitting}
                        data-testid="guest-view-date-input"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="guestStartTime"
                        style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
                      >
                        Bắt đầu (Giờ VN) <span style={{ color: 'red' }}>*</span>
                      </label>
                      <input
                        id="guestStartTime"
                        type="datetime-local"
                        step={1800}
                        className="form-control"
                        value={startTime}
                        onChange={(e) => {
                          setStartTime(e.target.value);
                          setSelectingStartTime(null);
                          if (errors.startTime)
                            setErrors((prev) => ({ ...prev, startTime: undefined }));
                        }}
                        disabled={isSubmitting}
                        aria-invalid={Boolean(errors.startTime)}
                        aria-describedby={errors.startTime ? 'guestStartTime-error' : undefined}
                        data-testid="guest-start-time-input"
                      />
                      {errors.startTime && (
                        <span
                          id="guestStartTime-error"
                          className="error-text"
                          role="alert"
                          style={{ color: 'red', fontSize: '0.85rem' }}
                        >
                          {errors.startTime}
                        </span>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="guestEndTime"
                        style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
                      >
                        Kết thúc (Giờ VN) <span style={{ color: 'red' }}>*</span>
                      </label>
                      <input
                        id="guestEndTime"
                        type="datetime-local"
                        step={1800}
                        className="form-control"
                        value={endTime}
                        onChange={(e) => {
                          setEndTime(e.target.value);
                          setSelectingStartTime(null);
                          if (errors.endTime)
                            setErrors((prev) => ({ ...prev, endTime: undefined }));
                        }}
                        disabled={isSubmitting}
                        aria-invalid={Boolean(errors.endTime)}
                        aria-describedby={errors.endTime ? 'guestEndTime-error' : undefined}
                        data-testid="guest-end-time-input"
                      />
                      {errors.endTime && (
                        <span
                          id="guestEndTime-error"
                          className="error-text"
                          role="alert"
                          style={{ color: 'red', fontSize: '0.85rem' }}
                        >
                          {errors.endTime}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* TimeGrid Component */}
                  <div style={{ marginTop: '1rem' }}>
                    {availability.loading && (
                      <div
                        className="time-grid-loading"
                        aria-live="polite"
                        style={{ padding: '1rem 0' }}
                        data-testid="guest-availability-loading"
                      >
                        <p className="text-muted" style={{ margin: 0, fontSize: '0.875rem' }}>
                          Đang tải lịch trống của phòng...
                        </p>
                      </div>
                    )}

                    {!availability.loading && availability.error && (
                      <div
                        className="alert alert-danger"
                        role="alert"
                        style={{ marginBottom: '1rem' }}
                        data-testid="guest-availability-error"
                      >
                        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>
                          {availability.error}
                        </p>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          data-testid="guest-retry-availability-btn"
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
                        >
                          Thử lại
                        </button>
                      </div>
                    )}

                    {!availability.loading && !availability.error && (
                      <>
                        <p
                          style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#4a5568' }}
                        >
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
                      </>
                    )}
                  </div>

                  {/* Summary / Price Preview */}
                  {preview && (
                    <div
                      style={{
                        marginTop: '1rem',
                        padding: '0.75rem 1rem',
                        background: '#f7fafc',
                        borderLeft: '4px solid #3182ce',
                        borderRadius: '4px',
                      }}
                      data-testid="guest-booking-price-preview"
                    >
                      <p style={{ margin: 0 }}>
                        Thời lượng: <strong>{preview.durationHours} giờ</strong> (
                        {preview.durationMinutes} phút)
                      </p>
                      <p style={{ margin: '0.25rem 0 0 0' }}>
                        Tạm tính:{' '}
                        <strong style={{ color: '#2b6cb0', fontSize: '1.1rem' }}>
                          {formatCurrency(preview.estimatedTotal)}
                        </strong>
                      </p>
                    </div>
                  )}
                </fieldset>
              )}

              {/* Note */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="guestNote"
                  style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
                >
                  Ghi chú (tối đa 500 ký tự)
                </label>
                <textarea
                  id="guestNote"
                  className="form-control"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="Ghi chú thêm (không bắt buộc)..."
                  disabled={isSubmitting}
                  data-testid="guest-note-input"
                />
                {errors.note && (
                  <span
                    className="error-text"
                    role="alert"
                    style={{ color: 'red', fontSize: '0.85rem' }}
                  >
                    {errors.note}
                  </span>
                )}
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    isSubmitting ||
                    selectedRoom?.status === 'MAINTENANCE' ||
                    Boolean(availability.error) ||
                    availability.loading
                  }
                  data-testid="guest-submit-btn"
                >
                  {availability.loading
                    ? 'Đang kiểm tra lịch trống...'
                    : isSubmitting
                      ? 'Đang xử lý...'
                      : 'Xác nhận đặt phòng vãng lai'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
};
