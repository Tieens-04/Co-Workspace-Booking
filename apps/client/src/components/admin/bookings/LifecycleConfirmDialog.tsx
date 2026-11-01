import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AdminBookingItem } from '../../../types/admin-booking';
import { useReturnFocus } from '../../../hooks/useReturnFocus';

export type LifecycleAction = 'complete' | 'no-show';

export interface LifecycleConfirmTarget {
  booking: AdminBookingItem;
  action: LifecycleAction;
}

interface LifecycleConfirmDialogProps {
  /** Booking + action awaiting confirmation; `null` closes the dialog. */
  target: LifecycleConfirmTarget | null;
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const COPY: Record<
  LifecycleAction,
  { title: string; description: string; confirm: string; pending: string }
> = {
  complete: {
    title: 'Xác nhận hoàn tất ca',
    description:
      'Đơn sẽ chuyển sang Hoàn tất. Trạng thái thanh toán giữ nguyên và thao tác này không thể hoàn tác.',
    confirm: 'Hoàn tất',
    pending: 'Đang hoàn tất…',
  },
  'no-show': {
    title: 'Xác nhận khách không đến',
    description:
      'Đơn sẽ chuyển sang Không đến. Trạng thái thanh toán giữ nguyên và thao tác này không thể hoàn tác.',
    confirm: 'Đánh dấu không đến',
    pending: 'Đang cập nhật…',
  },
};

/**
 * Confirmation for terminal lifecycle transitions (complete / no-show).
 * The server stays authoritative; this only prevents accidental or repeated clicks.
 */
export function LifecycleConfirmDialog({
  target,
  isSubmitting,
  onConfirm,
  onClose,
}: LifecycleConfirmDialogProps) {
  // Keep the last target so the content stays filled during the close animation.
  const [shown, setShown] = useState<LifecycleConfirmTarget | null>(target);
  const returnFocus = useReturnFocus();
  if (target && target !== shown) setShown(target);
  const copy = shown ? COPY[shown.action] : COPY.complete;

  const blockWhileSubmitting = (e: Event) => {
    if (isSubmitting) e.preventDefault();
  };

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <AlertDialogContent
        data-testid="lifecycle-confirm-dialog"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        {...returnFocus}
        onEscapeKeyDown={blockWhileSubmitting}
      >
        <AlertDialogHeader className="text-left sm:text-left">
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>
            Đơn{' '}
            <strong className="font-semibold text-foreground tabular-nums">
              {shown?.booking.bookingCode}
            </strong>
            . {copy.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            type="button"
            disabled={isSubmitting}
            data-testid="lifecycle-confirm-cancel-btn"
          >
            Quay lại
          </AlertDialogCancel>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            data-testid="lifecycle-confirm-submit-btn"
          >
            {isSubmitting ? copy.pending : copy.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
