import type * as React from 'react';
import { m } from 'motion/react';
import { fadeRise, staggerChildren } from '@/lib/motion';

interface StaggerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Seconds between children. */
  stagger?: number;
  /** Seconds before the first child starts. */
  delay?: number;
}

/**
 * Reveals `StaggerItem` children in order on mount. Change `key` on the group to
 * replay it (e.g. when a new page of results arrives).
 */
export function Stagger({ stagger = 0.06, delay = 0, children, ...props }: StaggerProps) {
  return (
    <m.div
      variants={staggerChildren(stagger, delay)}
      initial="hidden"
      animate="show"
      {...(props as React.ComponentProps<typeof m.div>)}
    >
      {children}
    </m.div>
  );
}

/** One revealed element inside a `Stagger` group. */
export function StaggerItem({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <m.div variants={fadeRise} {...(props as React.ComponentProps<typeof m.div>)}>
      {children}
    </m.div>
  );
}
