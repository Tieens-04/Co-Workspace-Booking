import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FieldProps {
  /** id of the control; label `htmlFor` points at it. */
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Override generated ids when existing tests/aria rely on them. */
  hintId?: string;
  errorId?: string;
  errorTestId?: string;
  className?: string;
  /** A single form control; receives id, aria-invalid and aria-describedby. */
  children: React.ReactElement<Record<string, unknown>>;
}

/** Label + control + hint + error, with the aria wiring done once. */
export function Field({
  id,
  label,
  hint,
  error,
  hintId = `${id}-hint`,
  errorId = `${id}-error`,
  errorTestId,
  className,
  children,
}: FieldProps) {
  const describedBy =
    [hint ? hintId : null, error ? errorId : null, children.props['aria-describedby']]
      .filter(Boolean)
      .join(' ') || undefined;

  const control = React.cloneElement(children, {
    id: children.props.id ?? id,
    'aria-invalid': children.props['aria-invalid'] ?? (error ? true : undefined),
    'aria-describedby': describedBy,
  });

  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-[0.8125rem] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          data-testid={errorTestId}
          className="flex items-start gap-1.5 text-[0.8125rem] text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
