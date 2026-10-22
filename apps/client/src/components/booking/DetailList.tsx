import type * as React from 'react';
import { cn } from '@/lib/utils';

interface DetailListProps extends React.ComponentProps<'dl'> {
  /** `split` keeps label and value on one line (narrow panels); `grid` uses a label column. */
  layout?: 'grid' | 'split';
}

/** Hairline-ruled key/value list used across the booking flow. */
export function DetailList({ layout = 'grid', className, ...props }: DetailListProps) {
  return (
    <dl
      data-layout={layout}
      className={cn('group/detail-list divide-y divide-border border-y border-border', className)}
      {...props}
    />
  );
}

interface DetailRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  label: React.ReactNode;
  children: React.ReactNode;
  valueClassName?: string;
}

export function DetailRow({
  label,
  children,
  className,
  valueClassName,
  ...props
}: DetailRowProps) {
  return (
    <div
      className={cn(
        'grid min-w-0 gap-1 py-3 text-sm',
        'sm:group-data-[layout=grid]/detail-list:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:group-data-[layout=grid]/detail-list:gap-4',
        'group-data-[layout=split]/detail-list:flex group-data-[layout=split]/detail-list:items-baseline group-data-[layout=split]/detail-list:justify-between group-data-[layout=split]/detail-list:gap-3',
        className,
      )}
      {...props}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'm-0 min-w-0 font-medium break-words text-foreground',
          'group-data-[layout=split]/detail-list:text-right',
          valueClassName,
        )}
      >
        {children}
      </dd>
    </div>
  );
}
