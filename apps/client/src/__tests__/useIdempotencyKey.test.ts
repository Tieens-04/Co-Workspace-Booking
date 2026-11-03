import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIdempotencyKey } from '../hooks/useIdempotencyKey';

const intent = { roomId: 'room-1', startTime: '2031-03-10T02:00:00.000Z', note: null };

describe('useIdempotencyKey (CWB-66)', () => {
  it('reuses the key for retries of the same intent', () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current.keyFor(intent);
    const retry = result.current.keyFor({ ...intent });

    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(retry).toBe(first);
  });

  it('issues a new key when the intent changes or after a confirmed success', () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current.keyFor(intent);
    const edited = result.current.keyFor({ ...intent, note: 'Thêm ghế' });
    expect(edited).not.toBe(first);

    result.current.reset();
    expect(result.current.keyFor({ ...intent, note: 'Thêm ghế' })).not.toBe(edited);
  });

  it('keeps the key stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const first = result.current.keyFor(intent);
    rerender();
    expect(result.current.keyFor(intent)).toBe(first);
  });
});
