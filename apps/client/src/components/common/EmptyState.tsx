import type * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleAlert, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

/** Dashed, left-aligned block for "nothing here yet" states. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'grid animate-rise justify-items-start gap-3 rounded-xl border border-dashed border-input p-8',
        className,
      )}
      {...props}
    >
      {Icon && (
        <Icon aria-hidden="true" className="size-7 text-muted-foreground" strokeWidth={1.25} />
      )}
      <h2 className="text-h3">{title}</h2>
      {description && <p className="max-w-[52ch] text-sm text-muted-foreground">{description}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

interface ErrorStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  retryTestId?: string;
  retrying?: boolean;
}

/** Error block with role="alert" and an optional retry button. */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = 'Thử lại',
  retryTestId,
  retrying = false,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'grid animate-rise grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 rounded-xl border border-status-cancelled-border bg-status-cancelled-bg p-5 text-status-cancelled',
        className,
      )}
      {...props}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5" />
      <div className="grid min-w-0 gap-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="text-sm">{description}</p>}
      </div>
      {onRetry && (
        <div className="col-start-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={retrying}
            data-testid={retryTestId}
          >
            <RotateCw aria-hidden="true" className={retrying ? 'animate-spin' : undefined} />
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
