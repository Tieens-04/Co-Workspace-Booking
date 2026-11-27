import React, { useState, useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { AuthContext } from '../context/auth-context-base';
import { useToast } from '../hooks/useToast';
import { useIdempotencyKey } from '../hooks/useIdempotencyKey';
import { roomApi } from '../services/room.api';
import { adminBookingApi } from '../services/admin-booking.api';
import { adminUserApi, AdminUserItem } from '../services/admin-user.api';
import { RoomListItem, RoomAvailabilitySlot } from '../types/room';
import { AdminBookingItem } from '../types/admin-booking';
import { useRoomAvailability } from '../hooks/useRoomAvailability';
import { TimeGrid } from './TimeGrid';
import { GuestBookingSuccess } from './admin/bookings/GuestBookingSuccess';
import { formatCurrency } from '../utils/format';
import { normalizePhoneNumber, phoneRule } from '../utils/validation';
import { ChevronDown, ChevronUp, CircleAlert, Loader2, UserCheck, UserPlus, X } from 'lucide-react';
import { ErrorState } from '@/components/common/EmptyState';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Pagination } from '@/components/common/Pagination';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  getVietnamTodayString,
  getBookingHorizonEnd,
  formatVnDateTimeLocal,
  parseVnDateTimeLocalToUtc,
  formatVnDate,
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

type AdminBookingMode = 'GUEST' | 'CUSTOMER';

export interface GuestFormErrors {
  customerId?: string;
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

  // Customer mode & identity state
  const [bookingMode, setBookingMode] = useState<AdminBookingMode>('GUEST');
  const [guestName, setGuestName] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');
  const [customerQuery, setCustomerQuery] = useState<string>('');
  const [customerResults, setCustomerResults] = useState<AdminUserItem[]>([]);
  const [hasSearchedCustomers, setHasSearchedCustomers] = useState<boolean>(false);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState<boolean>(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<AdminUserItem | null>(null);
  const [customerSearchNonce, setCustomerSearchNonce] = useState<number>(0);

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
  const { keyFor, reset: resetIdempotencyKey } = useIdempotencyKey();
  const roomsRequestRef = useRef<AbortController | null>(null);
  const customerSearchRequestRef = useRef<AbortController | null>(null);

  // Periodic clock update
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMs(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Session change & unmount effect: reset form state and abort pending requests
  // Drop the room list of a previous session during render so only page 1 is refetched.
  const [roomsSessionId, setRoomsSessionId] = useState<string | undefined>(effectivePrincipalId);
  if (roomsSessionId !== effectivePrincipalId) {
    setRoomsSessionId(effectivePrincipalId);
    setRooms([]);
    setRoomPage(1);
    setRoomTotalPages(1);
    setRoomsError(null);
  }

  function resetCustomerSearchState() {
    setCustomerQuery('');
    setCustomerResults([]);
    setHasSearchedCustomers(false);
    setIsSearchingCustomers(false);
    setCustomerSearchError(null);
    setSelectedCustomer(null);
  }

  useEffect(() => {
    abortControllerRef.current?.abort();
    customerSearchRequestRef.current?.abort();

    setBookingMode('GUEST');
    setGuestName('');
    setGuestPhone('');
    resetCustomerSearchState();
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
      roomsRequestRef.current?.abort();
      customerSearchRequestRef.current?.abort();
    };
  }, [effectivePrincipalId]);

  useEffect(() => {
    if (!isOpen || bookingMode !== 'CUSTOMER' || selectedCustomer) {
      customerSearchRequestRef.current?.abort();
      customerSearchRequestRef.current = null;
      setIsSearchingCustomers(false);
      return;
    }

    const trimmed = customerQuery.trim();
    if (!trimmed) {
      customerSearchRequestRef.current?.abort();
      customerSearchRequestRef.current = null;
      setCustomerResults([]);
      setHasSearchedCustomers(false);
      setCustomerSearchError(null);
      setIsSearchingCustomers(false);
      return;
    }

    const controller = new AbortController();
    customerSearchRequestRef.current?.abort();
    customerSearchRequestRef.current = controller;
    const requestingPrincipal = activePrincipalRef.current;
    const isStale = () =>
      controller.signal.aborted ||
      customerSearchRequestRef.current !== controller ||
      activePrincipalRef.current !== requestingPrincipal;

    setIsSearchingCustomers(true);
    setCustomerSearchError(null);

    const timer = window.setTimeout(async () => {
      try {
        const res = await adminUserApi.list(
          { q: trimmed, role: 'CUSTOMER', limit: 10 },
          controller.signal,
        );
        if (isStale()) return;
        if (res.success) {
          setCustomerResults(res.data.items);
          setHasSearchedCustomers(true);
        } else {
          setCustomerSearchError(res.message || 'Không thể tìm kiếm tài khoản khách hàng.');
        }
      } catch (err: any) {
        if (isStale()) return;
        setCustomerSearchError(
          err.response?.data?.message ||
            'Không thể tìm kiếm tài khoản khách hàng. Vui lòng thử lại.',
        );
      } finally {
        if (customerSearchRequestRef.current === controller) {
          customerSearchRequestRef.current = null;
          setIsSearchingCustomers(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    isOpen,
    bookingMode,
    customerQuery,
    selectedCustomer,
    customerSearchNonce,
    effectivePrincipalId,
  ]);

  const handleBookingModeChange = (nextMode: AdminBookingMode) => {
    if (nextMode === bookingMode || isSubmitting) return;
    customerSearchRequestRef.current?.abort();
    setBookingMode(nextMode);
    setGuestName('');
    setGuestPhone('');
    resetCustomerSearchState();
    setHasBookingConflict(false);
    setErrors((prev) => ({
      ...prev,
      customerId: undefined,
      guestName: undefined,
      guestPhone: undefined,
      general: undefined,
    }));
  };

  // Fetch rooms for selector; only the latest request for the current session may apply.
  const fetchRoomsForSelector = useCallback(async (page: number) => {
    roomsRequestRef.current?.abort();
    const controller = new AbortController();
    roomsRequestRef.current = controller;
    const requestingPrincipal = activePrincipalRef.current;
    const isStale = () =>
      controller.signal.aborted ||
      roomsRequestRef.current !== controller ||
      activePrincipalRef.current !== requestingPrincipal;

    setIsLoadingRooms(true);
    setRoomsError(null);
    try {
      const res = await roomApi.getRooms({ page, limit: 10 }, controller.signal);
      if (isStale()) return;
      if (res.success) {
        const items = res.data.items;
        setRooms(items);
        setRoomPage(res.data.pagination.page);
        setRoomTotalPages(res.data.pagination.totalPages);
        // Keep the selection across pages, refreshing it when this page has newer data.
        setSelectedRoom((prev) => (prev ? (items.find((r) => r.id === prev.id) ?? prev) : prev));
      } else {
        setRoomsError(res.message || 'Không thể tải danh sách phòng.');
      }
    } catch (err: any) {
      if (isStale()) return;
      setRoomsError(
        err.response?.data?.message || 'Không thể tải danh sách phòng. Vui lòng thử lại.',
      );
    } finally {
      if (roomsRequestRef.current === controller) {
        roomsRequestRef.current = null;
        setIsLoadingRooms(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRoomsForSelector(roomPage);
    }
  }, [isOpen, roomPage, fetchRoomsForSelector, roomsSessionId]);

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
      return [formatVnDate(startUtc)];
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

  // CWB-75: the server reports its booking horizon with each availability response.
  const todayVn = getVietnamTodayString(new Date(currentMs));
  const horizonMaxDate = availability.maxAdvanceDays
    ? formatVnDate(getBookingHorizonEnd(availability.maxAdvanceDays, new Date(currentMs)))
    : undefined;
  const horizonHint = availability.maxAdvanceDays
    ? `Có thể đặt trước tối đa ${availability.maxAdvanceDays} ngày (đến ${horizonMaxDate!.split('-').reverse().join('/')}).`
    : null;

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
    const timeValidation = validateBookingSelection(
      startUtc,
      endUtc,
      new Date(currentMs),
      undefined,
      availability.maxAdvanceDays,
    );
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
    availability.maxAdvanceDays,
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
    if (bookingMode === 'CUSTOMER') {
      if (!selectedCustomer) {
        newErrors.customerId = 'Vui lòng chọn tài khoản khách hàng';
      }
    } else {
      if (!trimmedName) {
        newErrors.guestName = 'Tên khách hàng không được để trống';
      } else if (trimmedName.length > 191) {
        newErrors.guestName = 'Tên khách hàng không được vượt quá 191 ký tự';
      }

      const phoneValidation = phoneRule.safeParse(guestPhone);
      if (!phoneValidation.success) {
        newErrors.guestPhone = phoneValidation.error.issues[0].message;
      }
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
      const timeCheck = validateBookingSelection(
        startUtc,
        endUtc,
        new Date(currentMs),
        note,
        availability.maxAdvanceDays,
      );
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
      const postValidation = validateBookingSelection(
        startUtc!,
        endUtc!,
        new Date(),
        note,
        availability.maxAdvanceDays,
      );
      if (!postValidation.isValid) {
        setErrors(postValidation.errors);
        return;
      }

      // 3. Check slot availability from freshly fetched slots
      const allFreshSlots = coveredDates.flatMap((d) => preflight.data?.[d] || []);
      const rangeCheck = checkRangeAvailability(startUtc!, endUtc!, allFreshSlots);
      if (!rangeCheck.isAvailable) {
        setHasBookingConflict(true);
        if (rangeCheck.reason === 'CLOSED_SLOT') {
          setErrors({
            general: `Khoảng thời gian đã chọn có chứa khung giờ đóng cửa${rangeCheck.conflictingSlot?.reason ? ` (${rangeCheck.conflictingSlot.reason})` : ''}. Vui lòng chọn khung giờ khác.`,
          });
        } else {
          setErrors({
            general:
              'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác hoặc điều chỉnh thời gian.',
          });
        }
        return;
      }

      // 4. Send request (guest walk-in vs registered customer)
      const trimmedNote = note.trim() === '' ? null : note.trim();
      let res;
      if (bookingMode === 'CUSTOMER') {
        const payload = {
          customerId: selectedCustomer!.id,
          roomId: selectedRoomId,
          startTime: startUtc!.toISOString(),
          endTime: endUtc!.toISOString(),
          note: trimmedNote,
        };
        res = await adminBookingApi.createCustomerBooking(
          payload,
          controller.signal,
          keyFor(payload),
        );
      } else {
        const payload = {
          roomId: selectedRoomId,
          startTime: startUtc!.toISOString(),
          endTime: endUtc!.toISOString(),
          guestName: trimmedName,
          guestPhone: normalizePhoneNumber(guestPhone.trim()),
          note: trimmedNote,
        };
        // Same intent reuses its key, so a retry after a lost response returns the same booking.
        res = await adminBookingApi.createGuestBooking(payload, controller.signal, keyFor(payload));
      }

      if (
        controller.signal.aborted ||
        abortControllerRef.current !== controller ||
        activePrincipalRef.current !== initiatingPrincipal
      ) {
        return;
      }

      if (res.success) {
        resetIdempotencyKey();
        showToast(
          bookingMode === 'CUSTOMER'
            ? 'Đặt phòng hộ khách hàng thành công!'
            : 'Đặt phòng cho khách vãng lai thành công!',
          'success',
        );
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
      } else if (code === 'ROOM_CLOSED') {
        setHasBookingConflict(true);
        const msg =
          message ||
          'Phòng hoặc cơ sở đang đóng cửa trong khoảng thời gian này. Vui lòng chọn khung giờ khác.';
        setErrors({ general: msg });
        showToast(msg, 'error');
        availability.refresh().catch(() => {});
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
      } else if (
        code === 'ACTIVE_BOOKING_LIMIT' ||
        code === 'ACCOUNT_LOCKED' ||
        code === 'EMAIL_NOT_VERIFIED' ||
        code === 'CUSTOMER_NOT_FOUND' ||
        code === 'INVALID_CUSTOMER_ROLE'
      ) {
        const msg = message || 'Không thể đặt phòng cho tài khoản khách hàng đã chọn.';
        setErrors({ general: msg });
        showToast(msg, 'error');
      } else if (code === 'VALIDATION_ERROR' && Array.isArray(details) && details.length > 0) {
        const fieldErrors: GuestFormErrors = {};
        for (const item of details) {
          if (item.field === 'customerId') fieldErrors.customerId = item.message;
          else if (item.field === 'guestName') fieldErrors.guestName = item.message;
          else if (item.field === 'guestPhone') fieldErrors.guestPhone = item.message;
          else if (item.field === 'startTime') fieldErrors.startTime = item.message;
          else if (item.field === 'endTime') fieldErrors.endTime = item.message;
          else if (item.field === 'note') fieldErrors.note = item.message;
          else if (!fieldErrors.general) fieldErrors.general = item.message;
        }
        setErrors(fieldErrors);
        showToast('Dữ liệu nhập không hợp lệ, vui lòng kiểm tra lại.', 'error');
      } else {
        const msg =
          message ||
          (bookingMode === 'CUSTOMER'
            ? 'Không thể tạo đơn đặt phòng hộ khách hàng. Vui lòng thử lại.'
            : 'Không thể tạo đơn đặt phòng cho khách vãng lai. Vui lòng thử lại.');
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
    resetCustomerSearchState();
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
            Đặt Phòng Hộ Khách Hàng
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

              {/* Customer Type & Identity */}
              <fieldset className={FIELDSET_CLASS}>
                <legend className={LEGEND_CLASS}>
                  {bookingMode === 'CUSTOMER' ? 'Khách có tài khoản' : 'Thông tin khách vãng lai'}
                </legend>
                <div
                  className="mb-4 flex flex-wrap gap-2"
                  role="group"
                  aria-label="Loại khách hàng"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={bookingMode === 'GUEST' ? 'default' : 'outline'}
                    aria-pressed={bookingMode === 'GUEST'}
                    disabled={isSubmitting}
                    onClick={() => handleBookingModeChange('GUEST')}
                    data-testid="booking-mode-guest"
                  >
                    <UserPlus aria-hidden="true" />
                    Khách vãng lai
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={bookingMode === 'CUSTOMER' ? 'default' : 'outline'}
                    aria-pressed={bookingMode === 'CUSTOMER'}
                    disabled={isSubmitting}
                    onClick={() => handleBookingModeChange('CUSTOMER')}
                    data-testid="booking-mode-customer"
                  >
                    <UserCheck aria-hidden="true" />
                    Khách có tài khoản
                  </Button>
                </div>

                {bookingMode === 'GUEST' ? (
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
                        inputMode="tel"
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
                ) : (
                  <div className="grid gap-3">
                    {selectedCustomer ? (
                      <div
                        data-testid="selected-customer-card"
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold">{selectedCustomer.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedCustomer.email}
                            {selectedCustomer.phoneNumber
                              ? ` • ${selectedCustomer.phoneNumber}`
                              : ''}
                          </p>
                          {selectedCustomer.upcomingBookingCount > 0 && (
                            <Badge
                              variant={
                                selectedCustomer.upcomingBookingCount >= 5
                                  ? 'destructive'
                                  : 'secondary'
                              }
                            >
                              Đang có {selectedCustomer.upcomingBookingCount}/5 đơn sắp tới
                            </Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() => {
                            setSelectedCustomer(null);
                            setErrors((prev) => ({
                              ...prev,
                              customerId: undefined,
                              general: undefined,
                            }));
                          }}
                          data-testid="clear-selected-customer-btn"
                        >
                          <X aria-hidden="true" />
                          Đổi khách
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Field
                          id="customerSearch"
                          label={
                            <>
                              Tìm tài khoản khách (email, SĐT hoặc họ tên){' '}
                              <span className="text-destructive">*</span>
                            </>
                          }
                          error={errors.customerId}
                        >
                          <Input
                            type="search"
                            value={customerQuery}
                            onChange={(e) => {
                              setCustomerQuery(e.target.value);
                              if (errors.customerId)
                                setErrors((prev) => ({ ...prev, customerId: undefined }));
                            }}
                            placeholder="Nhập email hoặc số điện thoại khách..."
                            maxLength={191}
                            disabled={isSubmitting}
                            data-testid="customer-search-input"
                          />
                        </Field>

                        {isSearchingCustomers && (
                          <div
                            aria-live="polite"
                            className="flex items-center gap-2 text-sm text-muted-foreground"
                            data-testid="customer-search-loading"
                          >
                            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                            <span>Đang tìm khách hàng...</span>
                          </div>
                        )}

                        {!isSearchingCustomers && customerSearchError && (
                          <ErrorState
                            className="p-3"
                            data-testid="customer-search-error"
                            title={customerSearchError}
                            onRetry={() => setCustomerSearchNonce((n) => n + 1)}
                            retryTestId="retry-customer-search-btn"
                          />
                        )}

                        {!isSearchingCustomers &&
                          !customerSearchError &&
                          hasSearchedCustomers &&
                          customerResults.length === 0 && (
                            <p
                              className="text-sm text-muted-foreground"
                              data-testid="customer-search-empty"
                            >
                              Không tìm thấy tài khoản CUSTOMER phù hợp.
                            </p>
                          )}

                        {!isSearchingCustomers &&
                          !customerSearchError &&
                          customerResults.length > 0 && (
                            <ul
                              aria-label="Danh sách tài khoản khách hàng"
                              data-testid="customer-search-results"
                              className="grid max-h-60 list-none gap-2 overflow-y-auto rounded-lg border p-2"
                            >
                              {customerResults.map((user) => {
                                const isLocked = user.status === 'LOCKED';
                                const isUnverified = !user.emailVerified;
                                const isDisabled = isLocked || isUnverified || isSubmitting;
                                return (
                                  <li key={user.id}>
                                    <button
                                      type="button"
                                      disabled={isDisabled}
                                      onClick={() => {
                                        setSelectedCustomer(user);
                                        setErrors((prev) => ({
                                          ...prev,
                                          customerId: undefined,
                                          general: undefined,
                                        }));
                                      }}
                                      data-testid={`customer-option-${user.id}`}
                                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                          {user.fullName}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                          {user.email}
                                          {user.phoneNumber ? ` • ${user.phoneNumber}` : ''}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {isLocked && <Badge variant="destructive">Đã khóa</Badge>}
                                        {isUnverified && (
                                          <Badge variant="outline">Chưa xác thực email</Badge>
                                        )}
                                        {user.upcomingBookingCount > 0 && (
                                          <Badge
                                            variant={
                                              user.upcomingBookingCount >= 5
                                                ? 'destructive'
                                                : 'secondary'
                                            }
                                          >
                                            {user.upcomingBookingCount}/5 đơn sắp tới
                                          </Badge>
                                        )}
                                      </div>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                      </>
                    )}
                    {selectedCustomer && errors.customerId && (
                      <p role="alert" className="text-sm text-destructive">
                        {errors.customerId}
                      </p>
                    )}
                  </div>
                )}
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
                  <p className="text-sm text-muted-foreground">
                    Chỉ đặt trong cùng ngày, từ 07:00 đến 22:00.
                  </p>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field id="viewDate" label="Xem lịch ngày" hint={horizonHint}>
                      <Input
                        type="date"
                        className="tabular-nums"
                        min={todayVn}
                        max={horizonMaxDate}
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
                        min={`${startTime.split('T')[0] || viewDate}T07:00`}
                        max={`${startTime.split('T')[0] || viewDate}T22:00`}
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
                          maxAdvanceDays={availability.maxAdvanceDays}
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
                      : bookingMode === 'CUSTOMER'
                        ? 'Xác nhận đặt phòng hộ khách'
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
