import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { ToastType } from '../context/toast-context-base';
import { cn } from '@/lib/utils';

const ICONS = {
  success: CircleCheck,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
} as const;

const ICON_TONE: Record<ToastType, string> = {
  success: 'text-status-success',
  error: 'text-destructive',
  warning: 'text-status-noshow',
  info: 'text-muted-foreground',
};

/** Left accent rule: a second, non-text cue for the toast tone. */
const ACCENT_TONE: Record<ToastType, string> = {
  success: 'before:bg-status-success',
  error: 'before:bg-destructive',
  warning: 'before:bg-status-noshow',
  info: 'before:bg-input',
};

interface ToastCardProps {
  type: ToastType;
  message: string;
  onDismiss: () => void;
}

/** Visual body of a toast. Sonner's list item has no role, so the card owns it. */
export function ToastCard({ type, message, onDismiss }: ToastCardProps) {
  const isError = type === 'error';
  const Icon = ICONS[type];

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      data-type={type}
      className={cn(
        'relative grid w-[min(380px,calc(100vw-2rem))] grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 overflow-hidden rounded-xl border bg-popover py-3.5 pr-3 pl-5 text-sm text-popover-foreground shadow-overlay',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
        ACCENT_TONE[type],
      )}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-[18px]', ICON_TONE[type])} />
      <p className="leading-relaxed font-medium">{message}</p>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={onDismiss}
        className="-mt-1 -mr-1 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
