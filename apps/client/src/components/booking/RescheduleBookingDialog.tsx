import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { BookingResult, RescheduleBookingPayload } from '../../types/booking';
import { AdminBookingItem, AdminRescheduleBookingPayload } from '../../types/admin-booking';
import { RoomAvailabilitySlot, RoomListItem } from '../../types/room';
import { bookingApi } from '../../services/booking.api';
import { adminBookingApi } from '../../services/admin-booking.api';
import { roomApi } from '../../services/room.api';
import { useRoomAvailability } from '../../hooks/useRoomAvailability';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Field } from '@/components/common/Field';
import { TimeGrid } from '../TimeGrid';
import { Notice } from './Notice';
import { formatVietnamDateTime } from './formatBookingTime';
import { formatCurrency } from '../../utils/format';
import {
  getVietnamTodayString,
  formatVnDate,
  formatVnTime,
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_LEAD_TIME_MS,
  calculateEstimatedTotal,
  parsePriceToCents,
} from '../../utils/bookingTime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type RescheduleBookingTarget = BookingResult | AdminBookingItem;

export type RescheduleBookingDialogProps =
  | {
      mode?: 'customer';
      isOpen: boolean;
      onOpenChange: (open: boolean) => void;
      booking: BookingResult;
      onSuccess: (updatedBooking: BookingResult) => void;
    }
  | {
      mode: 'admin';
      isOpen: boolean;
      onOpenChange: (open: boolean) => void;
      booking: AdminBookingItem | null;
      onSuccess: (updatedBooking: AdminBookingItem) => void;
    };

interface ServerPriceMismatchDetails {
  previousTotal: string;
  newTotal: string;
  difference: string;
}

async function fetchAllListedRooms(signal: AbortSignal): Promise<RoomListItem[]> {
  const first = await roomApi.getRooms({ page: 1, limit: 100 }, signal);
  const items = [...(first?.data?.items ?? [])];
  const totalPages = Math.min(first?.data?.pagination?.totalPages ?? 1, 10);
  for (let page = 2; page <= totalPages; page++) {
    if (signal.aborted) break;
    const next = await roomApi.getRooms({ page, limit: 100 }, signal);
    items.push(...(next?.data?.items ?? []));
  }
  return items;
}

export const RescheduleBookingDialog: React.FC<RescheduleBookingDialogProps> = (props) => {
  const { isOpen, onOpenChange, mode = 'customer' } = props;
  const isAdminMode = mode === 'admin';

  // Retain last non-null target so Radix close animation & focus return finish cleanly.
  const [shownBooking, setShownBooking] = useState<RescheduleBookingTarget | null>(props.booking);
  if (props.booking && props.booking !== shownBooking) {
    setShownBooking(props.booking);
  }
  const activeBooking = props.booking ?? shownBooking;

  const initialDate = useMemo(() => {
    try {
      return activeBooking?.startTime
        ? formatVnDate(new Date(activeBooking.startTime))
        : getVietnamTodayString();
    } catch {
      return getVietnamTodayString();
    }
  }, [activeBooking?.startTime]);

  const isRoomUnavailableCause =
    activeBooking?.roomUnavailableCause === 'ROOM_MAINTENANCE' ||
    activeBooking?.roomUnavailableCause === 'ROOM_ARCHIVED';

  const [viewDate, setViewDate] = useState<string>(initialDate);
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    activeBooking?.roomUnavailable ? '' : (activeBooking?.room.id ?? ''),
  );
  const [availableRooms, setAvailableRooms] = useState<RoomListItem[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState<boolean>(false);
  const [roomsStatus, setRoomsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomsReloadSeq, setRoomsReloadSeq] = useState<number>(0);
  const [isCurrentRoomUnavailable, setIsCurrentRoomUnavailable] =
    useState<boolean>(isRoomUnavailableCause);
  const [selectedStartIso, setSelectedStartIso] = useState<string | null>(null);
  const [selectedEndIso, setSelectedEndIso] = useState<string | null>(null);
  const [selectingStart, setSelectingStart] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [ackPriceDelta, setAckPriceDelta] = useState<boolean>(false);
  const [serverPriceMismatch, setServerPriceMismatch] = useState<ServerPriceMismatchDetails | null>(
    null,
  );
  const [note, setNote] = useState<string>(activeBooking?.note || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchedPriceByRoom, setFetchedPriceByRoom] = useState<Record<string, string>>({});

  const abortControllerRef = useRef<AbortController | null>(null);
  const submittingRef = useRef<boolean>(false);
  const selectedRoomIdRef = useRef<string>(selectedRoomId);
  selectedRoomIdRef.current = selectedRoomId;

  const activeBookingId = activeBooking?.id ?? '';
  const activeBookingRoomId = activeBooking?.room.id ?? '';
  const activeBookingRoomUnavailable = Boolean(activeBooking?.roomUnavailable);
  const activeBookingNote = activeBooking?.note || '';

  useEffect(() => {
    if (isOpen && activeBookingId) {
      submittingRef.current = false;
      setViewDate(initialDate);
      setSelectedRoomId(activeBookingRoomUnavailable ? '' : activeBookingRoomId);
      setAvailableRooms([]);
      setRoomsError(null);
      setRoomsStatus('idle');
      setIsCurrentRoomUnavailable(isRoomUnavailableCause);
      setSelectedStartIso(null);
      setSelectedEndIso(null);
      setSelectingStart(null);
      setReason('');
      setReasonError(null);
      setAckPriceDelta(false);
      setServerPriceMismatch(null);
      setNote(activeBookingNote);
      setErrorMessage(null);
      setIsSubmitting(false);
    } else if (!isOpen) {
      abortControllerRef.current?.abort();
      setIsLoadingRooms(false);
      setRoomsStatus('idle');
      setRoomsError(null);
      setAvailableRooms([]);
    }
  }, [
    isOpen,
    initialDate,
    activeBookingId,
    activeBookingNote,
    activeBookingRoomId,
    activeBookingRoomUnavailable,
    isRoomUnavailableCause,
  ]);

  useEffect(() => {
    if (!isOpen || !activeBookingId || typeof roomApi?.getRooms !== 'function') {
      setIsLoadingRooms(false);
      return;
    }
    const controller = new AbortController();
    setIsLoadingRooms(true);
    setRoomsStatus('loading');
    setRoomsError(null);

    fetchAllListedRooms(controller.signal)
      .then((allItems) => {
        if (controller.signal.aborted) return;
        const avail = allItems.filter((r) => r.status === 'AVAILABLE');
        const currentInAvail = avail.some((r) => r.id === activeBookingRoomId);
        const currentExplicitlyUnavailable = allItems.some(
          (r) => r.id === activeBookingRoomId && r.status !== 'AVAILABLE',
        );
        const currentUnavailable =
          isRoomUnavailableCause ||
          currentExplicitlyUnavailable ||
          ((activeBookingRoomUnavailable || allItems.length > 0) && !currentInAvail);

        setAvailableRooms(avail);
        setIsCurrentRoomUnavailable(currentUnavailable);
        setRoomsStatus('ready');
        const prevRoomId = selectedRoomIdRef.current;
        const nextRoomId = currentUnavailable
          ? prevRoomId && avail.some((r) => r.id === prevRoomId)
            ? prevRoomId
            : avail[0]?.id || ''
          : prevRoomId || activeBookingRoomId;
        setSelectedRoomId(nextRoomId);
        if (nextRoomId !== prevRoomId) {
          setSelectedStartIso(null);
          setSelectedEndIso(null);
          setSelectingStart(null);
          resetRangeSelectionEffects();
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const apiMessage =
          (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
            ?.message ||
          (err as { message?: string })?.message ||
          'Không thể tải danh sách phòng khả dụng.';
        setAvailableRooms([]);
        setRoomsError(apiMessage);
        setRoomsStatus('error');
        if (!isRoomUnavailableCause) {
          setSelectedRoomId((prev) => prev || activeBookingRoomId);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingRooms(false);
        }
      });
    return () => controller.abort();
  }, [
    isOpen,
    activeBookingId,
    activeBookingRoomId,
    activeBookingRoomUnavailable,
    isRoomUnavailableCause,
    roomsReloadSeq,
  ]);

  useEffect(() => {
    if (!isOpen || !selectedRoomId || typeof roomApi?.getRoomById !== 'function') return;
    const roomInList = availableRooms.find((r) => r.id === selectedRoomId);
    if (roomInList) return;
    const controller = new AbortController();
    roomApi
      .getRoomById(selectedRoomId, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res?.data?.pricePerHour) {
          const cents = parsePriceToCents(String(res.data.pricePerHour));
          if (cents !== null && cents > 0) {
            setFetchedPriceByRoom((prev) => ({
              ...prev,
              [selectedRoomId]: String(res.data!.pricePerHour),
            }));
          }
        }
      })
      .catch(() => {
        // Fallback to rate derived from booking when unchanged room
      });
    return () => controller.abort();
  }, [isOpen, selectedRoomId, availableRooms]);

  const roomsPendingForUnavailable =
    activeBookingRoomUnavailable &&
    typeof roomApi?.getRooms === 'function' &&
    roomsStatus !== 'ready' &&
    roomsStatus !== 'error';

  const availability = useRoomAvailability(
    selectedRoomId || activeBookingRoomId,
    [viewDate],
    isOpen && Boolean(selectedRoomId) && !roomsPendingForUnavailable,
  );

  // Adjust slots: slots belonging to the current booking are made available only on the same room
  // so that the customer/admin can shift their own time without self-conflict, unless an active
  // Closure covers that slot (`slot.reason !== undefined`), revealing the underlying CLOSED slot.
  const adjustedSlots = useMemo<RoomAvailabilitySlot[]>(() => {
    const rawSlots = availability.slotsByDate[viewDate] || [];
    if (!activeBooking || selectedRoomId !== activeBooking.room.id) {
      return rawSlots;
    }
    const currentStartMs = new Date(activeBooking.startTime).getTime();
    const currentEndMs = new Date(activeBooking.endTime).getTime();

    return rawSlots.map((slot): RoomAvailabilitySlot => {
      const slotStartMs = new Date(slot.startTime).getTime();
      const slotEndMs = new Date(slot.endTime).getTime();
      if (slot.status === 'BOOKED' && slotStartMs >= currentStartMs && slotEndMs <= currentEndMs) {
        return {
          ...slot,
          status: slot.reason !== undefined ? 'CLOSED' : 'AVAILABLE',
        };
      }
      return slot;
    });
  }, [availability.slotsByDate, viewDate, selectedRoomId, activeBooking]);

  const resetRangeSelectionEffects = () => {
    setAckPriceDelta(false);
    setServerPriceMismatch(null);
    setErrorMessage(null);
  };

  const handleSelectStart = (iso: string) => {
    setSelectingStart(iso);
    setSelectedStartIso(null);
    setSelectedEndIso(null);
    resetRangeSelectionEffects();
  };

  const handleSelectRange = (startIso: string, endIso: string) => {
    setSelectingStart(null);
    setSelectedStartIso(startIso);
    setSelectedEndIso(endIso);
    resetRangeSelectionEffects();
  };

  const priceCalculation = useMemo(() => {
    if (!activeBooking) {
      return {
        hourlyRate: 0,
        newDurationMinutes: 0,
        newDurationHours: 0,
        newEstimatedTotal: 0,
        difference: 0,
        isValidRange: false,
      };
    }

    const selectedRoomPrice = availableRooms.find((r) => r.id === selectedRoomId)?.pricePerHour;
    const listedRateStr =
      selectedRoomPrice !== undefined
        ? String(selectedRoomPrice)
        : fetchedPriceByRoom[selectedRoomId];
    let hourlyRateStr = listedRateStr;

    if (!hourlyRateStr && selectedRoomId === activeBooking.room.id) {
      const oldStart = new Date(activeBooking.startTime).getTime();
      const oldEnd = new Date(activeBooking.endTime).getTime();
      const oldDurationHours = (oldEnd - oldStart) / (60 * 60 * 1000);
      if (oldDurationHours > 0) {
        const derived = Number(activeBooking.totalAmount) / oldDurationHours;
        if (Number.isFinite(derived) && derived > 0) {
          hourlyRateStr = derived.toFixed(2);
        }
      }
    }

    const hourlyRate = hourlyRateStr ? Number(hourlyRateStr) : 0;

    if (!selectedStartIso || !selectedEndIso) {
      return {
        hourlyRate,
        newDurationMinutes: 0,
        newDurationHours: 0,
        newEstimatedTotal: 0,
        difference: 0,
        isValidRange: false,
      };
    }

    const newStart = new Date(selectedStartIso).getTime();
    const newEnd = new Date(selectedEndIso).getTime();
    const newDurationMinutes = Math.round((newEnd - newStart) / (60 * 1000));
    const newDurationHours = newDurationMinutes / 60;
    const isValidRange =
      newDurationMinutes >= MIN_DURATION_MINUTES && newDurationMinutes <= MAX_DURATION_MINUTES;

    const estimatedStr = hourlyRateStr
      ? calculateEstimatedTotal(hourlyRateStr, newDurationMinutes)
      : null;
    const newEstimatedCents = estimatedStr
      ? parsePriceToCents(estimatedStr)
      : Math.round(hourlyRate * newDurationHours * 100);
    const oldTotalCents =
      parsePriceToCents(String(activeBooking.totalAmount)) ??
      Math.round(Number(activeBooking.totalAmount) * 100);
    const resolvedNewCents = newEstimatedCents ?? 0;

    return {
      hourlyRate,
      newDurationMinutes,
      newDurationHours,
      newEstimatedTotal: resolvedNewCents / 100,
      difference: (resolvedNewCents - oldTotalCents) / 100,
      isValidRange,
    };
  }, [
    availableRooms,
    fetchedPriceByRoom,
    selectedRoomId,
    activeBooking,
    selectedStartIso,
    selectedEndIso,
  ]);

  const effectiveDifference = serverPriceMismatch
    ? Number(serverPriceMismatch.difference)
    : priceCalculation.difference;
  const requiresPaidDeltaConfirmation =
    isAdminMode &&
    activeBooking?.paymentStatus === 'PAID' &&
    Boolean(selectedStartIso && selectedEndIso) &&
    (effectiveDifference !== 0 || serverPriceMismatch !== null);

  if (!activeBooking) return null;

  const isScheduleUnchanged =
    isAdminMode &&
    selectedRoomId !== '' &&
    selectedStartIso !== null &&
    selectedEndIso !== null &&
    selectedRoomId === activeBooking.room.id &&
    new Date(selectedStartIso).getTime() === new Date(activeBooking.startTime).getTime() &&
    new Date(selectedEndIso).getTime() === new Date(activeBooking.endTime).getTime();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!selectedRoomId) {
      setErrorMessage('Vui lòng chọn phòng khả dụng.');
      return;
    }

    if (!selectedStartIso || !selectedEndIso) {
      setErrorMessage('Vui lòng chọn khung giờ mới trên lưới.');
      return;
    }

    if (!priceCalculation.isValidRange) {
      setErrorMessage(
        `Thời lượng đặt phòng phải từ ${MIN_DURATION_MINUTES / 60}h đến ${MAX_DURATION_MINUTES / 60}h.`,
      );
      return;
    }

    if (isAdminMode) {
      if (isScheduleUnchanged) {
        setErrorMessage('Khung giờ hoặc phòng mới phải khác lịch hiện tại.');
        return;
      }

      const trimmedReason = reason.trim();
      if (!trimmedReason) {
        setReasonError('Vui lòng nhập lý do đổi lịch');
        return;
      }
      if (trimmedReason.length > 500) {
        setReasonError('Lý do đổi lịch không được vượt quá 500 ký tự');
        return;
      }

      if (requiresPaidDeltaConfirmation && !ackPriceDelta) {
        setErrorMessage('Vui lòng xác nhận đã xử lý phần chênh lệch thanh toán tại quầy.');
        return;
      }
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    setReasonError(null);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (props.mode === 'admin') {
        const payload: AdminRescheduleBookingPayload = {
          startTime: selectedStartIso,
          endTime: selectedEndIso,
          reason: reason.trim(),
          note: note.trim() === '' ? null : note.trim(),
          ...(selectedRoomId !== activeBooking.room.id ? { roomId: selectedRoomId } : {}),
          ...(requiresPaidDeltaConfirmation ? { acknowledgePriceDelta: ackPriceDelta } : {}),
        };
        const res = await adminBookingApi.rescheduleBooking(
          activeBooking.id,
          payload,
          controller.signal,
        );
        if (res.data) {
          props.onSuccess(res.data);
          onOpenChange(false);
        }
      } else {
        const payload: RescheduleBookingPayload = {
          startTime: selectedStartIso,
          endTime: selectedEndIso,
          note: note.trim() === '' ? null : note.trim(),
          ...(selectedRoomId !== activeBooking.room.id ? { roomId: selectedRoomId } : {}),
        };
        const res = await bookingApi.rescheduleBooking(
          activeBooking.id,
          payload,
          controller.signal,
        );
        if (res.data) {
          props.onSuccess(res.data);
          onOpenChange(false);
        }
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      const errorCode = err?.response?.data?.code;
      const details = err?.response?.data?.details as ServerPriceMismatchDetails | undefined;
      if (
        isAdminMode &&
        errorCode === 'PAID_BOOKING_PRICE_MISMATCH' &&
        details?.previousTotal &&
        details?.newTotal &&
        details?.difference
      ) {
        setServerPriceMismatch(details);
        setAckPriceDelta(false);
      }
      const apiMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Đổi lịch đặt phòng thất bại. Vui lòng thử lại.';
      setErrorMessage(apiMessage);
    } finally {
      submittingRef.current = false;
      if (!controller.signal.aborted) {
        setIsSubmitting(false);
      }
    }
  };

  const selectedRoomName =
    availableRooms.find((r) => r.id === selectedRoomId)?.name || activeBooking.room.name;

  const blockWhileSubmitting = (e: Event) => {
    if (isSubmitting) e.preventDefault();
  };

  return (
    <Dialog open={isOpen} onOpenChange={isSubmitting ? undefined : onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        data-testid="reschedule-dialog-content"
        onEscapeKeyDown={blockWhileSubmitting}
        onInteractOutside={blockWhileSubmitting}
      >
        <DialogHeader>
          <DialogTitle>Đổi lịch đặt phòng</DialogTitle>
          <DialogDescription>
            Chọn ngày và khung giờ mới cho đơn đặt phòng{' '}
            <strong className="font-semibold text-foreground">{activeBooking.bookingCode}</strong>{' '}
            tại <strong className="font-semibold text-foreground">{selectedRoomName}</strong>.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <Notice tone="error" data-testid="reschedule-error-notice">
            {errorMessage}
          </Notice>
        )}

        <div className="grid gap-4 py-2">
          {/* Current schedule info */}
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium text-foreground">Lịch hiện tại:</p>
            <p className="text-muted-foreground tabular-nums">
              {formatVietnamDateTime(activeBooking.startTime)} –{' '}
              {formatVietnamDateTime(activeBooking.endTime)} (Giờ Việt Nam)
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tổng tiền:{' '}
              <strong className="text-foreground">
                {formatCurrency(activeBooking.totalAmount)}
              </strong>
              {activeBooking.paymentStatus === 'PAID' && ' (Đã thanh toán)'}
            </p>
          </div>

          {/* Room Picker */}
          <div className="grid gap-2">
            <Label htmlFor="reschedule-room" className="text-sm font-medium">
              Phòng
            </Label>
            {isLoadingRooms ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Đang tải danh sách phòng khả dụng...
              </div>
            ) : (
              <NativeSelect
                id="reschedule-room"
                value={selectedRoomId}
                disabled={isSubmitting}
                data-testid="reschedule-room-select"
                onChange={(e) => {
                  setSelectedRoomId(e.target.value);
                  setSelectedStartIso(null);
                  setSelectedEndIso(null);
                  setSelectingStart(null);
                  resetRangeSelectionEffects();
                }}
              >
                {!selectedRoomId && availableRooms.length === 0 && (
                  <option value="">
                    {roomsError
                      ? '-- Không tải được danh sách phòng --'
                      : '-- Hiện không có phòng trống khả dụng --'}
                  </option>
                )}
                {!selectedRoomId && availableRooms.length > 0 && (
                  <option value="" disabled>
                    -- Chọn phòng khả dụng --
                  </option>
                )}
                {!isCurrentRoomUnavailable &&
                  Boolean(selectedRoomId) &&
                  !availableRooms.some((r) => r.id === activeBooking.room.id) && (
                    <option value={activeBooking.room.id}>
                      {activeBooking.room.name} (Phòng hiện tại)
                    </option>
                  )}
                {availableRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.capacity} chỗ · {formatCurrency(r.pricePerHour)}/giờ)
                    {r.id === activeBooking.room.id ? ' — Phòng hiện tại' : ''}
                  </option>
                ))}
              </NativeSelect>
            )}
            {roomsError && !isLoadingRooms && (
              <Notice tone="error" data-testid="reschedule-rooms-error">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Không thể tải danh sách phòng khả dụng: {roomsError}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRoomsReloadSeq((seq) => seq + 1)}
                    disabled={isSubmitting}
                    data-testid="reschedule-rooms-retry-btn"
                  >
                    <RotateCw aria-hidden="true" className="mr-1.5 size-3.5" />
                    Thử lại
                  </Button>
                </div>
              </Notice>
            )}
          </div>

          {/* Date Picker */}
          <div className="grid gap-2">
            <Label htmlFor="reschedule-date" className="text-sm font-medium">
              Chọn ngày đổi lịch
            </Label>
            <div className="flex gap-2">
              <Input
                id="reschedule-date"
                type="date"
                value={viewDate}
                min={getVietnamTodayString()}
                onChange={(e) => {
                  setViewDate(e.target.value);
                  setSelectedStartIso(null);
                  setSelectedEndIso(null);
                  setSelectingStart(null);
                  resetRangeSelectionEffects();
                }}
                disabled={isSubmitting || !selectedRoomId}
                className="max-w-[200px]"
                data-testid="reschedule-date-input"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedStartIso(null);
                  setSelectedEndIso(null);
                  setSelectingStart(null);
                  resetRangeSelectionEffects();
                  availability.refresh();
                }}
                disabled={availability.loading || isSubmitting || !selectedRoomId}
                className="gap-1.5"
              >
                <RotateCw
                  aria-hidden="true"
                  className={`size-4 ${availability.loading ? 'animate-spin' : ''}`}
                />
                Tải lại
              </Button>
            </div>
          </div>

          {/* TimeGrid */}
          <div className="grid gap-2">
            <p className="text-sm font-medium text-foreground">
              Chọn khung giờ mới trên lưới (bước 30 phút)
            </p>
            {!isLoadingRooms && !roomsError && !selectedRoomId && (
              <Notice tone="warning" data-testid="reschedule-no-available-rooms">
                {isAdminMode
                  ? 'Hiện chưa có phòng khả dụng để chuyển lịch. Vui lòng kiểm tra trạng thái phòng hoặc hủy đơn nếu cần.'
                  : 'Hiện chưa có phòng khả dụng để chuyển lịch. Vui lòng liên hệ quầy lễ tân hoặc hủy đơn nếu cần.'}
              </Notice>
            )}
            {Boolean(selectedRoomId) && availability.loading && (
              <div className="flex items-center justify-center rounded-lg border p-8">
                <Loader2 aria-hidden="true" className="size-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Đang tải lịch trống...</span>
              </div>
            )}
            {Boolean(selectedRoomId) && !availability.loading && availability.error && (
              <Notice tone="error">Không thể tải lịch trống: {availability.error}</Notice>
            )}
            {Boolean(selectedRoomId) && !availability.loading && !availability.error && (
              <TimeGrid
                slots={adjustedSlots}
                selectedStartTime={selectedStartIso}
                selectedEndTime={selectedEndIso}
                selectingStartTime={selectingStart}
                onSelectStart={handleSelectStart}
                onSelectRange={handleSelectRange}
                disabled={isSubmitting}
                maxAdvanceDays={availability.maxAdvanceDays}
                minLeadTimeMs={isAdminMode ? 0 : MIN_LEAD_TIME_MS}
              />
            )}
          </div>

          {/* New Schedule Preview & Price Comparison */}
          {selectedStartIso && selectedEndIso && (
            <div
              className="grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"
              data-testid="reschedule-preview-box"
            >
              <h4 className="font-semibold text-primary">Tóm tắt thay đổi:</h4>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Khung giờ mới:</span>
                  <p className="font-medium text-foreground tabular-nums">
                    {formatVnTime(new Date(selectedStartIso))} –{' '}
                    {formatVnTime(new Date(selectedEndIso))} ngày {viewDate}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Thời lượng:</span>
                  <p className="font-medium text-foreground tabular-nums">
                    {priceCalculation.newDurationHours} giờ ({priceCalculation.newDurationMinutes}{' '}
                    phút)
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tổng tiền mới dự kiến:</span>
                  <p className="text-base font-bold text-foreground tabular-nums">
                    {formatCurrency(
                      serverPriceMismatch
                        ? serverPriceMismatch.newTotal
                        : priceCalculation.newEstimatedTotal,
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    * Giá tạm tính; hệ thống sẽ chốt tổng tiền theo đơn giá phòng hiện tại khi xác
                    nhận.
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Chênh lệch:</span>
                  <p className="font-medium text-foreground tabular-nums">
                    {effectiveDifference === 0 ? (
                      'Không đổi (0đ)'
                    ) : effectiveDifference > 0 ? (
                      <span className="font-semibold text-status-warning">
                        + {formatCurrency(effectiveDifference)}
                      </span>
                    ) : (
                      <span className="font-semibold text-status-success">
                        - {formatCurrency(Math.abs(effectiveDifference))}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {requiresPaidDeltaConfirmation && (
            <Notice tone="warning" data-testid="reschedule-paid-delta-warning">
              <div className="grid gap-2">
                <p>
                  Đơn đặt phòng đã thanh toán (
                  <strong>
                    {formatCurrency(
                      serverPriceMismatch?.previousTotal ?? activeBooking.totalAmount,
                    )}
                  </strong>
                  ).{' '}
                  {effectiveDifference > 0 ? (
                    <>
                      Cần thu thêm tại quầy:{' '}
                      <strong>+ {formatCurrency(effectiveDifference)}</strong>.
                    </>
                  ) : (
                    <>
                      Cần hoàn trả cho khách tại quầy:{' '}
                      <strong>- {formatCurrency(Math.abs(effectiveDifference))}</strong>.
                    </>
                  )}
                </p>
                <label className="flex cursor-pointer items-start gap-2 text-xs font-medium text-foreground">
                  <input
                    id="reschedule-ack-price-delta"
                    type="checkbox"
                    checked={ackPriceDelta}
                    onChange={(e) => {
                      setAckPriceDelta(e.target.checked);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting}
                    data-testid="reschedule-ack-price-delta"
                    className="mt-0.5 size-4 rounded border-input accent-primary"
                  />
                  <span>
                    Tôi xác nhận đã thu thêm hoặc hoàn trả phần chênh lệch tại quầy cho đơn đã thanh
                    toán này.
                  </span>
                </label>
              </div>
            </Notice>
          )}

          {isAdminMode && (
            <Field
              id="reschedule-reason"
              label={
                <>
                  Lý do đổi lịch <span className="text-destructive">*</span>
                </>
              }
              error={reasonError}
            >
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError) setReasonError(null);
                }}
                placeholder="Nhập lý do đổi lịch (bắt buộc)..."
                maxLength={500}
                disabled={isSubmitting}
                data-testid="reschedule-reason-input"
              />
            </Field>
          )}

          {/* Optional Note */}
          <div className="grid gap-1.5">
            <Label htmlFor="reschedule-note" className="text-sm font-medium">
              Ghi chú mới (tùy chọn)
            </Label>
            <Input
              id="reschedule-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thêm về yêu cầu phòng..."
              maxLength={500}
              disabled={isSubmitting}
              data-testid="reschedule-note-input"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            data-testid="reschedule-cancel-btn"
          >
            Đóng
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              !selectedRoomId ||
              !selectedStartIso ||
              !selectedEndIso ||
              isSubmitting ||
              (requiresPaidDeltaConfirmation && !ackPriceDelta)
            }
            aria-busy={isSubmitting || undefined}
            data-testid="reschedule-confirm-btn"
          >
            {isSubmitting && <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />}
            {isSubmitting ? 'Đang xử lý...' : 'Xác nhận đổi lịch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
