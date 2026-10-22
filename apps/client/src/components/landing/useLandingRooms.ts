import { useCallback, useEffect, useState } from 'react';
import { roomApi } from '../../services/room.api';
import type { RoomListItem } from '../../types/room';

export type LandingStatus = 'loading' | 'success' | 'error';

/** First page of real rooms shared by the hero photo and the featured section. */
const LANDING_ROOM_QUERY = { page: 1, limit: 6 } as const;

export interface LandingRoomsState {
  rooms: RoomListItem[];
  status: LandingStatus;
  retry: () => void;
}

/** Single `getRooms` call for the landing page; aborted on unmount or before a retry. */
export function useLandingRooms(): LandingRoomsState {
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [status, setStatus] = useState<LandingStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    roomApi
      .getRooms({ ...LANDING_ROOM_QUERY }, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setRooms(response.data?.items ?? []);
        setStatus('success');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRooms([]);
        setStatus('error');
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { rooms, status, retry };
}
