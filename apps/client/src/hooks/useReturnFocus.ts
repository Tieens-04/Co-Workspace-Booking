import { useRef } from 'react';

/**
 * Focus handlers for controlled Radix dialogs opened without a Trigger:
 * remember the element focused when the dialog opens and restore it on close.
 */
export function useReturnFocus() {
  const previousFocus = useRef<HTMLElement | null>(null);

  return {
    onOpenAutoFocus: () => {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      const target = previousFocus.current;
      if (target?.isConnected) target.focus();
    },
  };
}
