import { useCallback, useRef } from 'react';

const newKey = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Idempotency key for one booking intent (CWB-66). Repeated submissions of the same intent
 * (double click, retry after a lost response) reuse the key so the server returns the original
 * booking; any change to the intent gets a fresh key. Call `reset` after a confirmed success.
 */
export function useIdempotencyKey() {
  const current = useRef<{ intent: string; key: string } | null>(null);

  const keyFor = useCallback((intent: unknown) => {
    const serialized = JSON.stringify(intent);
    if (!current.current || current.current.intent !== serialized) {
      current.current = { intent: serialized, key: newKey() };
    }
    return current.current.key;
  }, []);

  const reset = useCallback(() => {
    current.current = null;
  }, []);

  return { keyFor, reset };
}
