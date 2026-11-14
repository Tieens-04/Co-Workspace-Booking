import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { BookingResult, RescheduleBookingPayload } from '../../types/booking';
import { RoomListItem } from '../../types/room';
import { bookingApi } from '../../services/booking.api';
import { roomApi } from '../../services/room.api';
import { useRoomAvailability } from '../../hooks/useRoomAvailability';
import { NativeSelect } from '@/components/common/NativeSelect';
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
} from '../../utils/bookingTime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface RescheduleBookingDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingResult;
  onSuccess: (updatedBooking: BookingResult) => void;
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

export const RescheduleBookingDialog: React.FC<RescheduleBookingDialogProps> = ({
  isOpen,
  onOpenChange,
  booking,
  onSuccess,
}) => {
  const initialDate = useMemo(() => {
    try {
      return booking.startTime
        ? formatVnDate(new Date(booking.startTime))
        : getVietnamTodayString();
    } catch {
      return getVietnamTodayString();
    }
  }, [booking.startTime]);

  const isRoomUnavailableCause =
    booking.roomUnavailableCause === 'ROOM_MAINTENANCE' ||
    booking.roomUnavailableCause === 'ROOM_ARCHIVED';

  const [viewDate, setViewDate] = useState<string>(initialDate);
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    booking.roomUnavailable ? '' : booking.room.id,
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
  const [note, setNote] = useState<string>(booking.note || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchedPriceByRoom, setFetchedPriceByRoom] = useState<Record<string, number>>({});

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync state when dialog opens or closes
  useEffect(() => {
    if (isOpen) {
      setViewDate(initialDate);
      setSelectedRoomId(booking.roomUnavailable ? '' : booking.room.id);
      setAvailableRooms([]);
      setRoomsError(null);
      setRoomsStatus('idle');
      setIsCurrentRoomUnavailable(isRoomUnavailableCause);
      setSelectedStartIso(null);
      setSelectedEndIso(null);
      setSelectingStart(null);
      setNote(booking.note || '');
      setErrorMessage(null);
      setIsSubmitting(false);
    } else {
      abortControllerRef.current?.abort();
      setIsLoadingRooms(false);
      setRoomsStatus('idle');
      setRoomsError(null);
      setAvailableRooms([]);
    }
  }, [
    isOpen,
    initialDate,
    booking.note,
    booking.room.id,
    booking.roomUnavailable,
    isRoomUnavailableCause,
  ]);

  useEffect(() => {
    if (!isOpen || typeof roomApi?.getRooms !== 'function') {
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
        const currentInAvail = avail.some((r) => r.id === booking.room.id);
        const currentExplicitlyUnavailable = allItems.some(
          (r) => r.id === booking.room.id && r.status !== 'AVAILABLE',
        );
        const currentUnavailable =
          isRoomUnavailableCause ||
          currentExplicitlyUnavailable ||
          ((Boolean(booking.roomUnavailable) || allItems.length > 0) && !currentInAvail);

        setAvailableRooms(avail);
        setIsCurrentRoomUnavailable(currentUnavailable);
        setRoomsStatus('ready');
        if (currentUnavailable) {
          setSelectedRoomId((prev) =>
            prev && avail.some((r) => r.id === prev) ? prev : avail[0]?.id || '',
          );
        } else {
          setSelectedRoomId((prev) => prev || booking.room.id);
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
          setSelectedRoomId((prev) => prev || booking.room.id);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingRooms(false);
        }
      });
    return () => controller.abort();
  }, [isOpen, booking.room.id, booking.roomUnavailable, isRoomUnavailableCause, roomsReloadSeq]);

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
          const parsed = Number(res.data.pricePerHour);
          if (Number.isFinite(parsed) && parsed > 0) {
            setFetchedPriceByRoom((prev) => ({ ...prev, [selectedRoomId]: parsed }));
          }
        }
      })
      .catch(() => {
        // Fallback to rate derived from booking when unchanged room
      });
    return () => controller.abort();
  }, [isOpen, selectedRoomId, availableRooms]);

  const roomsPendingForUnavailable =
    Boolean(booking.roomUnavailable) &&
    typeof roomApi?.getRooms === 'function' &&
    roomsStatus !== 'ready' &&
    roomsStatus !== 'error';

  const availability = useRoomAvailability(
    selectedRoomId || booking.room.id,
    [viewDate],
    isOpen && Boolean(selectedRoomId) && !roomsPendingForUnavailable,
  );

  // Adjust slots: slots belonging to the current booking are made available only on the same room
  // so that the customer can adjust or shift their own time without conflicting with themselves.
  const adjustedSlots = useMemo(() => {
    const rawSlots = availability.slotsByDate[viewDate] || [];
    if (selectedRoomId !== booking.room.id) {
      return rawSlots;
    }
    const currentStartMs = new Date(booking.startTime).getTime();
    const currentEndMs = new Date(booking.endTime).getTime();

    return rawSlots.map((slot) => {
      const slotStartMs = new Date(slot.startTime).getTime();
      const slotEndMs = new Date(slot.endTime).getTime();
      if (slot.status === 'BOOKED' && slotStartMs >= currentStartMs && slotEndMs <= currentEndMs) {
        return { ...slot, available: true, status: 'AVAILABLE' as const };
      }
      return slot;
    });
  }, [
    availability.slotsByDate,
    viewDate,
    selectedRoomId,
    booking.room.id,
    booking.startTime,
    booking.endTime,
  ]);

  const handleSelectStart = (iso: string) => {
    setSelectingStart(iso);
    setSelectedStartIso(null);
    setSelectedEndIso(null);
    setErrorMessage(null);
  };

  const handleSelectRange = (startIso: string, endIso: string) => {
    setSelectingStart(null);
    setSelectedStartIso(startIso);
    setSelectedEndIso(endIso);
    setErrorMessage(null);
  };

  // Pricing calculations
  const priceCalculation = useMemo(() => {
    const selectedRoomPrice = availableRooms.find((r) => r.id === selectedRoomId)?.pricePerHour;
    const listedRate = selectedRoomPrice !== undefined ? Number(selectedRoomPrice) : NaN;
    const fetchedRate = fetchedPriceByRoom[selectedRoomId];
    let hourlyRate = 0;

    if (Number.isFinite(listedRate) && listedRate > 0) {
      hourlyRate = listedRate;
    } else if (typeof fetchedRate === 'number' && Number.isFinite(fetchedRate) && fetchedRate > 0) {
      hourlyRate = fetchedRate;
    } else if (selectedRoomId === booking.room.id) {
      const oldStart = new Date(booking.startTime).getTime();
      const oldEnd = new Date(booking.endTime).getTime();
      const oldDurationHours = (oldEnd - oldStart) / (60 * 60 * 1000);
      hourlyRate = oldDurationHours > 0 ? Number(booking.totalAmount) / oldDurationHours : 0;
    }

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
    const newEstimatedTotal = Math.round(hourlyRate * newDurationHours);
    const difference = newEstimatedTotal - Number(booking.totalAmount);
    const isValidRange =
      newDurationMinutes >= MIN_DURATION_MINUTES && newDurationMinutes <= MAX_DURATION_MINUTES;

    return {
      hourlyRate,
      newDurationMinutes,
      newDurationHours,
      newEstimatedTotal,
      difference,
      isValidRange,
    };
  }, [
    availableRooms,
    fetchedPriceByRoom,
    selectedRoomId,
    booking.room.id,
    booking.startTime,
    booking.endTime,
    booking.totalAmount,
    selectedStartIso,
    selectedEndIso,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    setIsSubmitting(true);
    setErrorMessage(null);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const payload: RescheduleBookingPayload = {
        startTime: selectedStartIso,
        endTime: selectedEndIso,
        note: note.trim() === '' ? null : note.trim(),
        ...(selectedRoomId !== booking.room.id ? { roomId: selectedRoomId } : {}),
      };
      const res = await bookingApi.rescheduleBooking(booking.id, payload, controller.signal);

      if (res.data) {
        onSuccess(res.data);
        onOpenChange(false);
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      const apiMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Đổi lịch đặt phòng thất bại. Vui lòng thử lại.';
      setErrorMessage(apiMessage);
    } finally {
      if (!controller.signal.aborted) {
        setIsSubmitting(false);
      }
    }
  };

  const selectedRoomName =
    availableRooms.find((r) => r.id === selectedRoomId)?.name || booking.room.name;

  return (
    <Dialog open={isOpen} onOpenChange={isSubmitting ? undefined : onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        data-testid="reschedule-dialog-content"
      >
        <DialogHeader>
          <DialogTitle>Đổi lịch đặt phòng</DialogTitle>
          <DialogDescription>
            Chọn ngày và khung giờ mới cho đơn đặt phòng{' '}
            <strong className="font-semibold text-foreground">{booking.bookingCode}</strong> tại{' '}
            <strong className="font-semibold text-foreground">{selectedRoomName}</strong>.
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
              {formatVietnamDateTime(booking.startTime)} – {formatVietnamDateTime(booking.endTime)}{' '}
              (Giờ Việt Nam)
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tổng tiền:{' '}
              <strong className="text-foreground">{formatCurrency(booking.totalAmount)}</strong>
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
                  setErrorMessage(null);
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
                  !availableRooms.some((r) => r.id === booking.room.id) && (
                    <option value={booking.room.id}>{booking.room.name} (Phòng hiện tại)</option>
                  )}
                {availableRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.capacity} chỗ · {formatCurrency(r.pricePerHour)}/giờ)
                    {r.id === booking.room.id ? ' — Phòng hiện tại' : ''}
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
                }}
                disabled={isSubmitting || !selectedRoomId}
                className="max-w-[200px]"
                data-testid="reschedule-date-input"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => availability.refresh()}
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
                Hiện chưa có phòng khả dụng để chuyển lịch. Vui lòng liên hệ quầy lễ tân hoặc hủy
                đơn nếu cần.
              </Notice>
            )}
            {Boolean(selectedRoomId) && availability.loading && (
              <div className="flex items-center justify-center p-8 border rounded-lg">
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
              />
            )}
          </div>

          {/* New Schedule Preview & Price Comparison */}
          {selectedStartIso && selectedEndIso && (
            <div
              className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm grid gap-2"
              data-testid="reschedule-preview-box"
            >
              <h4 className="font-semibold text-primary">Tóm tắt thay đổi:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
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
                  <p className="font-bold text-base text-foreground tabular-nums">
                    {formatCurrency(priceCalculation.newEstimatedTotal)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    * Giá tạm tính; hệ thống sẽ chốt tổng tiền theo đơn giá phòng hiện tại khi xác
                    nhận.
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Chênh lệch:</span>
                  <p className="font-medium text-foreground tabular-nums">
                    {priceCalculation.difference === 0 ? (
                      'Không đổi (0đ)'
                    ) : priceCalculation.difference > 0 ? (
                      <span className="text-amber-600 font-semibold">
                        + {formatCurrency(priceCalculation.difference)}
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-semibold">
                        - {formatCurrency(Math.abs(priceCalculation.difference))}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
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
            disabled={!selectedRoomId || !selectedStartIso || !selectedEndIso || isSubmitting}
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
