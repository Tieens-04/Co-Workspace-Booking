import type * as React from 'react';
import { cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NoticeTone = 'info' | 'warning' | 'error' | 'success' | 'maintenance';

const noticeVariants = cva(
  'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-relaxed',
  {
    variants: {
      tone: {
        info: 'border-border bg-muted text-foreground',
        warning: 'border-status-noshow-border bg-status-noshow-bg text-status-noshow',
        error: 'border-status-cancelled-border bg-status-cancelled-bg text-status-cancelled',
        success: 'border-status-success-border bg-status-success-bg text-status-success',
        maintenance:
          'border-status-maintenance-border bg-status-maintenance-bg text-status-maintenance',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

const TONE_ICONS: Record<NoticeTone, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
  success: CircleCheck,
  maintenance: Wrench,
};

interface NoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: NoticeTone;
  icon?: LucideIcon;
}

/**
 * Inline banner for booking-flow hints, warnings and errors.
 * The caller decides the live-region semantics through `role`.
 */
export function Notice({ tone = 'info', icon, className, children, ...props }: NoticeProps) {
  const Icon = icon ?? TONE_ICONS[tone];
  return (
    <div className={cn(noticeVariants({ tone }), className)} {...props}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
