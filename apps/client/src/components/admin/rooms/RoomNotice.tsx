import type * as React from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type RoomNoticeTone = 'success' | 'error';

interface RoomNoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone: RoomNoticeTone;
  /** Renders a dismiss button with this accessible name when `onDismiss` is set. */
  dismissLabel?: string;
  onDismiss?: () => void;
}

const toneClasses: Record<RoomNoticeTone, string> = {
  success: 'border-status-success-border bg-status-success-bg text-status-success',
  error: 'border-status-cancelled-border bg-status-cancelled-bg text-status-cancelled',
};

/** Compact inline banner for admin room feedback (success, load/save errors). */
export function RoomNotice({
  tone,
  dismissLabel,
  onDismiss,
  className,
  children,
  ...props
}: RoomNoticeProps) {
  const Icon = tone === 'success' ? CircleCheck : CircleAlert;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="-my-1 -mr-1 text-current hover:bg-foreground/5"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
