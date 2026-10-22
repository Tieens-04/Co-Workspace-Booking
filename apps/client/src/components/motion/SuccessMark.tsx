import { m } from 'motion/react';
import { EASE_EDITORIAL } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Confirmation mark: the ring settles in, then the check draws itself.
 * Decorative; the surrounding heading carries the meaning.
 */
export function SuccessMark({ className }: { className?: string }) {
  return (
    <m.span
      aria-hidden="true"
      className={cn(
        'inline-flex size-12 items-center justify-center rounded-full border border-status-success-border bg-status-success-bg text-status-success',
        className,
      )}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE_EDITORIAL }}
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none">
        <m.path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, delay: 0.2, ease: EASE_EDITORIAL }}
        />
      </svg>
    </m.span>
  );
}
