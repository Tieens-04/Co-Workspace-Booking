import { useId } from 'react';
import type * as React from 'react';
import { m } from 'motion/react';
import { DURATION, EASE_EDITORIAL } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  testId?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Group of toggle buttons (aria-pressed); used for filters such as booking status tabs.
 * The selected "pill" slides between options so the change of filter is easy to follow.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const indicatorId = useId();

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px]',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            data-testid={option.testId}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
              selected && 'text-foreground',
            )}
          >
            {selected && (
              <m.span
                aria-hidden="true"
                layoutId={indicatorId}
                className="absolute inset-0 rounded-md bg-card shadow-soft ring-1 ring-border"
                transition={{ duration: DURATION.slow, ease: EASE_EDITORIAL }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
