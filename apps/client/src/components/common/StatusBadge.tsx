import type * as React from 'react';
import { cva } from 'class-variance-authority';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStatusMeta, type StatusKind, type StatusTone } from '../../utils/status';

const toneBadgeVariants = cva(
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[0.78rem] leading-none font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        confirmed: 'border-status-confirmed-border bg-status-confirmed-bg text-status-confirmed',
        success: 'border-status-success-border bg-status-success-bg text-status-success',
        cancelled: 'border-status-cancelled-border bg-status-cancelled-bg text-status-cancelled',
        noshow: 'border-status-noshow-border bg-status-noshow-bg text-status-noshow',
        unpaid: 'border-dashed border-status-unpaid-border bg-status-unpaid-bg text-status-unpaid',
        maintenance:
          'border-status-maintenance-border bg-status-maintenance-bg text-status-maintenance',
        neutral: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

interface ToneBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  /** Replaces the leading dot, e.g. a check mark for "paid". */
  icon?: React.ReactNode;
}

/** Pill badge in one of the status tones. Always carries a text label. */
export function ToneBadge({ tone, icon, className, children, ...props }: ToneBadgeProps) {
  return (
    <span data-tone={tone} className={cn(toneBadgeVariants({ tone }), className)} {...props}>
      {icon ?? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

interface StatusBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  kind: StatusKind;
  status: string;
  /** Overrides the Vietnamese label (e.g. keep the raw enum on admin tables). */
  label?: React.ReactNode;
}

/** Badge for a booking, payment or room status; exposes `data-status` for tests and styling. */
export function StatusBadge({ kind, status, label, ...props }: StatusBadgeProps) {
  const meta = getStatusMeta(kind, status);
  const icon =
    kind === 'payment' && status === 'PAID' ? (
      <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
    ) : undefined;

  return (
    <ToneBadge tone={meta.tone} icon={icon} data-status={status} {...props}>
      {label ?? meta.label}
    </ToneBadge>
  );
}
