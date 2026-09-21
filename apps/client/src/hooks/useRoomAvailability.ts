import { useState, useEffect, useRef, useCallback } from 'react';
import { roomApi } from '../services/room.api';
import { RoomAvailabilitySlot } from '../types/room';

export interface UseRoomAvailabilityResult {
  slots: RoomAvailabilitySlot[];
  slotsByDate: Record<string, RoomAvailabilitySlot[]>;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  refresh: () => Promise<{
    success: boolean;
    data?: Record<string, RoomAvailabilitySlot[]>;
    code?: string;
    message?: string;
  }>;
}

export function useRoomAvailability(
  roomId: string,
  dates: string[],
  enabled = true,
): UseRoomAvailabilityResult {
  const [slotsByDate, setSlotsByDate] = useState<Record<string, RoomAvailabilitySlot[]>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);

  // Normalized dates key to avoid unnecessary refetches when array reference changes
  const datesKey = [...dates].sort().join(',');

  const fetchDates = useCallback(
    async (
      targetRoomId: string,
      targetDates: string[],
    ): Promise<{
      success: boolean;
      data?: Record<string, RoomAvailabilitySlot[]>;
      code?: string;
      message?: string;
    }> => {
      if (!enabled || !targetRoomId || targetDates.length === 0) {
        setSlotsByDate({});
        setLoading(false);
        setError(null);
        setErrorCode(null);
        return { success: true, data: {} };
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const currentReqId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      setErrorCode(null);

      try {
        const promises = targetDates.map((date) =>
          roomApi.getAvailability(targetRoomId, date, controller.signal),
        );

        const responses = await Promise.all(promises);

        if (controller.signal.aborted || requestIdRef.current !== currentReqId) {
          return { success: false, message: 'Aborted' };
        }

        const newSlotsByDate: Record<string, RoomAvailabilitySlot[]> = {};
        for (const res of responses) {
          if (
            res.data &&
            res.data.date &&
            Array.isArray(res.data.slots) &&
            res.data.slots.length === 48
          ) {
            newSlotsByDate[res.data.date] = res.data.slots;
          } else {
            throw new Error('Dữ liệu lịch trống không đầy đủ (yêu cầu 48 khung giờ trong ngày).');
          }
        }

        setSlotsByDate(newSlotsByDate);
        setLoading(false);
        return { success: true, data: newSlotsByDate };
      } catch (err: any) {
        if (controller.signal.aborted || requestIdRef.current !== currentReqId) {
          return { success: false, message: 'Aborted' };
        }

        const serverCode =
          err.response?.data?.code ||
          (err.response?.status === 404
            ? 'ROOM_NOT_FOUND'
            : err.message?.includes('48 khung giờ')
              ? 'INVALID_AVAILABILITY_DATA'
              : 'ERROR');
        const serverMessage =
          err.response?.data?.message || err.message || 'Không thể tải lịch phòng';

        setError(serverMessage);
        setErrorCode(serverCode);
        setLoading(false);
        // N2: Clear stale snapshot on error so unverified slots are not presented as available
        setSlotsByDate({});

        return {
          success: false,
          code: serverCode,
          message: serverMessage,
        };
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled || !roomId || dates.length === 0) {
      setSlotsByDate({});
      setLoading(false);
      setError(null);
      setErrorCode(null);
      return () => {
        abortControllerRef.current?.abort();
      };
    }

    fetchDates(roomId, dates);

    return () => {
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, datesKey, enabled, fetchDates]);

  const refresh = useCallback(async () => {
    return fetchDates(roomId, dates);
  }, [roomId, dates, fetchDates]);

  // Derived flat array of slots in chronological order across requested dates
  const slots = dates.flatMap((d) => slotsByDate[d] || []);

  return {
    slots,
    slotsByDate,
    loading,
    error,
    errorCode,
    refresh,
  };
}
