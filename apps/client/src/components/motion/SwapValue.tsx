import type * as React from 'react';
import { m } from 'motion/react';
import { DURATION, EASE_EDITORIAL } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface SwapValueProps {
  /** Changing this replays the entrance; usually the formatted value itself. */
  value: React.Key;
  children: React.ReactNode;
  className?: string;
}

/**
 * Slides a changed value (price, count) in from below so the user notices the update.
 * The old value is replaced immediately — only the new one animates — so the DOM never
 * holds two values at once.
 */
export function SwapValue({ value, children, className }: SwapValueProps) {
  return (
    <span className={cn('inline-block overflow-hidden align-bottom', className)}>
      <m.span
        key={value}
        className="inline-block"
        initial={{ opacity: 0, y: '45%' }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.slow, ease: EASE_EDITORIAL }}
      >
        {children}
      </m.span>
    </span>
  );
}
