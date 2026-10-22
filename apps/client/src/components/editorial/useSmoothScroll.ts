import { useEffect } from 'react';
import Lenis from 'lenis';

/** Elements whose own scrolling must stay native (dialogs, sheets, nested scroll areas). */
const NATIVE_SCROLL = [
  '[data-lenis-prevent]',
  '[role="dialog"]',
  '[role="menu"]',
  '[data-slot$="-overlay"]',
  '[data-slot="dialog-content"]',
  '[data-slot="sheet-content"]',
  '[data-slot="dropdown-menu-content"]',
].join(', ');

/**
 * Inertial wheel scrolling for long discovery pages (landing, explorer). Touch keeps native
 * momentum, reduced-motion users keep native scrolling, and the instance is destroyed on unmount
 * so product screens (booking, admin) are never affected.
 */
export function useSmoothScroll(onScroll?: () => void) {
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.09,
      smoothWheel: true,
      syncTouch: false,
      prevent: (node) => Boolean(node.closest?.(NATIVE_SCROLL)),
    });
    if (onScroll) lenis.on('scroll', onScroll);
    return () => lenis.destroy();
  }, [onScroll]);
}
