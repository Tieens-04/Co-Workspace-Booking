import type * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import { Skeleton } from '@/components/ui/skeleton';
import { EASE_EDITORIAL, fadeRise } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: React.ReactNode;
  icon?: LucideIcon;
  value: React.ReactNode;
  /** Visual slot between the value and the meta lines (e.g. an occupancy bar). */
  visual?: React.ReactNode;
  children?: React.ReactNode;
  testId?: string;
  valueTestId?: string;
  className?: string;
}

/** Data-first KPI: eyebrow label, bold tabular figure, hairline-ruled meta lines. */
export function KpiCard({
  label,
  icon: Icon,
  value,
  visual,
  children,
  testId,
  valueTestId,
  className,
}: KpiCardProps) {
  return (
    <m.article
      data-testid={testId}
      variants={fadeRise}
      className={cn(
        'grid content-start gap-3 rounded-xl border bg-card p-5 text-card-foreground',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-[0.6875rem]">{label}</p>
        {Icon && (
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </span>
        )}
      </div>
      <p
        data-testid={valueTestId}
        className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] tabular-nums sm:text-[2rem]"
      >
        {value}
      </p>
      {visual}
      {children && (
        <div className="grid gap-1 border-t pt-3 text-[0.8125rem] text-muted-foreground tabular-nums">
          {children}
        </div>
      )}
    </m.article>
  );
}

/** Placeholder with the same footprint as a KpiCard. */
export function KpiCardSkeleton() {
  return (
    <div
      className="grid min-h-[140px] content-start gap-4 rounded-xl border bg-card p-5"
      data-testid="kpi-skeleton-card"
    >
      <Skeleton className="h-3.5 w-3/5" />
      <Skeleton className="h-9 w-2/5" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

interface MeterProps {
  /** 0–100; clamped. */
  value: number;
  label: string;
}

/** Thin moss progress bar; width comes from a CSS custom property. */
export function KpiMeter({ value, label }: MeterProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      {/* Grows from the left on mount, then eases to new values. */}
      <m.div
        className="h-full w-[var(--occupancy)] origin-left rounded-full bg-primary transition-[width] duration-200 ease-editorial"
        style={{ '--occupancy': `${clamped}%` } as React.CSSProperties}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.4, delay: 0.1, ease: EASE_EDITORIAL }}
      />
    </div>
  );
}
