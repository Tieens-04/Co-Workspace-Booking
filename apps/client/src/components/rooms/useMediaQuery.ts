import { useCallback, useSyncExternalStore } from 'react';

/** Below the `lg` breakpoint the filter rail moves into a sheet. */
export const MOBILE_FILTERS_QUERY = '(max-width: 1023px)';

function getMediaQueryList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

/** Subscribes to a CSS media query. Returns false when matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = getMediaQueryList(query);
      if (!mql) return () => {};
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
      }
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    },
    [query],
  );

  const getSnapshot = () => getMediaQueryList(query)?.matches ?? false;

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
