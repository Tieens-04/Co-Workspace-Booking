import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRoomAvailability } from '../hooks/useRoomAvailability';
import { roomApi } from '../services/room.api';
import { ApiResponse, RoomAvailabilityResponseData } from '../types/room';

vi.mock('../services/room.api', () => ({
  roomApi: {
    getAvailability: vi.fn(),
  },
}));

const mockSlots = (date: string) =>
  Array.from({ length: 48 }, (_, i) => {
    const dayStart = new Date(`${date}T00:00:00.000+07:00`);
    const slotStart = new Date(dayStart.getTime() + i * 30 * 60 * 1000);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
    return {
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString(),
      status: (i === 1 ? 'BOOKED' : 'AVAILABLE') as 'BOOKED' | 'AVAILABLE',
    };
  });

const mockAvailabilityResponse = (
  date: string,
  roomId = 'room-1',
): ApiResponse<RoomAvailabilityResponseData> => ({
  success: true,
  message: 'Success',
  data: {
    roomId,
    date,
    timezone: 'Asia/Ho_Chi_Minh',
    slots: mockSlots(date),
  },
});

describe('useRoomAvailability hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches availability for single date when enabled', async () => {
    vi.mocked(roomApi.getAvailability).mockResolvedValueOnce(
      mockAvailabilityResponse('2026-10-25'),
    );

    const { result } = renderHook(() =>
      useRoomAvailability('room-1', ['2026-10-25'], true),
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(roomApi.getAvailability).toHaveBeenCalledTimes(1);
    expect(roomApi.getAvailability).toHaveBeenCalledWith('room-1', '2026-10-25', expect.any(AbortSignal));
    expect(result.current.slots).toHaveLength(48);
    expect(result.current.slotsByDate['2026-10-25']).toHaveLength(48);
    expect(result.current.error).toBeNull();
  });

  it('fetches multiple dates for overnight booking range', async () => {
    vi.mocked(roomApi.getAvailability).mockImplementation(async (_id, date) =>
      mockAvailabilityResponse(date),
    );

    const { result } = renderHook(() =>
      useRoomAvailability('room-1', ['2026-10-25', '2026-10-26'], true),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(roomApi.getAvailability).toHaveBeenCalledTimes(2);
    expect(result.current.slots).toHaveLength(96);
    expect(result.current.slotsByDate['2026-10-25']).toHaveLength(48);
    expect(result.current.slotsByDate['2026-10-26']).toHaveLength(48);
  });

  it('handles error response and sets error states', async () => {
    const error404 = {
      name: 'AxiosError',
      response: {
        status: 404,
        data: {
          code: 'ROOM_NOT_FOUND',
          message: 'Không tìm thấy phòng',
        },
      },
    };
    vi.mocked(roomApi.getAvailability).mockRejectedValueOnce(error404);

    const { result } = renderHook(() =>
      useRoomAvailability('room-1', ['2026-10-25'], true),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Không tìm thấy phòng');
    expect(result.current.errorCode).toBe('ROOM_NOT_FOUND');
    expect(result.current.slots).toEqual([]);
  });

  // F3 Regression: 409 ROOM_NOT_AVAILABLE
  it('F3: handles 409 ROOM_NOT_AVAILABLE correctly and sets errorCode', async () => {
    const error409 = {
      name: 'AxiosError',
      response: {
        status: 409,
        data: {
          code: 'ROOM_NOT_AVAILABLE',
          message: 'Phòng đang trong trạng thái bảo trì',
        },
      },
    };
    vi.mocked(roomApi.getAvailability).mockRejectedValueOnce(error409);

    const { result } = renderHook(() =>
      useRoomAvailability('room-1', ['2026-10-25'], true),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorCode).toBe('ROOM_NOT_AVAILABLE');
    expect(result.current.error).toBe('Phòng đang trong trạng thái bảo trì');
    expect(result.current.slots).toEqual([]);
  });

  // F4 Regression: invalid slot data / < 48 slots
  it('F4: sets INVALID_AVAILABILITY_DATA if response contains fewer than 48 slots', async () => {
    const malformedResponse: ApiResponse<RoomAvailabilityResponseData> = {
      success: true,
      message: 'Success',
      data: {
        roomId: 'room-1',
        date: '2026-10-25',
        timezone: 'Asia/Ho_Chi_Minh',
        slots: [{ startTime: '2026-10-25T02:00:00.000Z', endTime: '2026-10-25T02:30:00.000Z', status: 'AVAILABLE' }],
      },
    };
    vi.mocked(roomApi.getAvailability).mockResolvedValueOnce(malformedResponse);

    const { result } = renderHook(() =>
      useRoomAvailability('room-1', ['2026-10-25'], true),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorCode).toBe('INVALID_AVAILABILITY_DATA');
    expect(result.current.slots).toEqual([]);
  });

  it('does not fetch when enabled is false or roomId is empty', async () => {
    const { result } = renderHook(() =>
      useRoomAvailability('room-1', ['2026-10-25'], false),
    );

    expect(roomApi.getAvailability).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.slots).toEqual([]);
  });

  it('prevents race conditions when date changes rapidly (stale response ignored)', async () => {
    let resolveFirst: (val: any) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    vi.mocked(roomApi.getAvailability).mockImplementation((_id, date) => {
      if (date === '2026-10-25') {
        return firstPromise as any;
      }
      return Promise.resolve(mockAvailabilityResponse(date));
    });

    const { result, rerender } = renderHook(
      ({ dates }) => useRoomAvailability('room-1', dates, true),
      { initialProps: { dates: ['2026-10-25'] } },
    );

    expect(result.current.loading).toBe(true);

    // Date changes to 2026-10-26 before 2026-10-25 resolves
    rerender({ dates: ['2026-10-26'] });

    await waitFor(() => {
      expect(result.current.slotsByDate['2026-10-26']).toBeDefined();
    });

    // Now resolve the late first response
    await act(async () => {
      resolveFirst!(mockAvailabilityResponse('2026-10-25'));
    });

    // Stale 2026-10-25 should NOT overwrite or corrupt 2026-10-26 state
    expect(result.current.slotsByDate['2026-10-26']).toHaveLength(48);
    expect(result.current.slots).toHaveLength(48);
  });

  it('refresh method triggers fresh request and returns updated data', async () => {
    vi.mocked(roomApi.getAvailability).mockResolvedValueOnce(
      mockAvailabilityResponse('2026-10-25'),
    );

    const { result } = renderHook(() =>
      useRoomAvailability('room-1', ['2026-10-25'], true),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(roomApi.getAvailability).toHaveBeenCalledTimes(1);

    // Mock next call with an updated slot (status changed to BOOKED)
    const updatedResponse = mockAvailabilityResponse('2026-10-25');
    updatedResponse.data.slots[0].status = 'BOOKED';
    vi.mocked(roomApi.getAvailability).mockResolvedValueOnce(updatedResponse);

    let refreshResult: any;
    await act(async () => {
      refreshResult = await result.current.refresh();
    });

    expect(roomApi.getAvailability).toHaveBeenCalledTimes(2);
    expect(refreshResult.success).toBe(true);
    expect(result.current.slots[0].status).toBe('BOOKED');
  });

  it('aborts pending request on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(roomApi.getAvailability).mockImplementation((_id, _date, signal) => {
      capturedSignal = signal;
      return new Promise(() => {}); // never resolves
    });

    const { unmount } = renderHook(() =>
      useRoomAvailability('room-1', ['2026-10-25'], true),
    );

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    unmount();

    expect(capturedSignal!.aborted).toBe(true);
  });
});
