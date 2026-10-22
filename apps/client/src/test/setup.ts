import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { toast } from 'sonner';
import { afterEach, vi } from 'vitest';

window.scrollTo = vi.fn();

// jsdom gaps used by Radix, Sonner and Motion. Plain functions (not vi.fn) so
// tests that call vi.resetAllMocks/restoreAllMocks cannot wipe them.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: NoopObserver,
  });
}
if (!('IntersectionObserver' in window)) {
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: NoopObserver,
  });
}

const elementProto = Element.prototype as unknown as Record<string, unknown>;
for (const method of [
  'hasPointerCapture',
  'setPointerCapture',
  'releasePointerCapture',
  'scrollIntoView',
]) {
  if (typeof elementProto[method] !== 'function') {
    elementProto[method] = method === 'hasPointerCapture' ? () => false : () => {};
  }
}

MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  toast.dismiss();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('style');
});
