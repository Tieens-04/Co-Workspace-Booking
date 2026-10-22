import { useState } from 'react';
import type * as React from 'react';
import { CircleAlert, Loader2, TriangleAlert } from 'lucide-react';
import { AdminBookingItem } from '../../../types/admin-booking';
import { Field } from '@/components/common/Field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface CancelBookingDialogProps {
  /** Booking being cancelled; `null` closes the dialog. */
  booking: AdminBookingItem | null;
  reason: string;
  onReasonChange: (value: string) => void;
  validationError: string | null;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

/** Admin cancellation with a required reason. Cannot be dismissed while the request is in flight. */
export function CancelBookingDialog({
  booking,
  reason,
  onReasonChange,
  validationError,
  isSubmitting,
  error,
  onSubmit,
  onClose,
}: CancelBookingDialogProps) {
  // Keep the last booking so the content stays filled during the close animation.
  const [shown, setShown] = useState<AdminBookingItem | null>(booking);
  if (booking && booking !== shown) setShown(booking);

  const blockWhileSubmitting = (e: Event) => {
    if (isSubmitting) e.preventDefault();
  };

  return (
    <Dialog
      open={booking !== null}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent
        data-testid="admin-cancel-modal"
        className="sm:max-w-[460px]"
        onEscapeKeyDown={blockWhileSubmitting}
        onInteractOutside={blockWhileSubmitting}
      >
        <DialogHeader className="text-left sm:text-left">
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert aria-hidden="true" className="size-5 shrink-0 text-destructive" />
            Hủy đơn đặt phòng
          </DialogTitle>
          <DialogDescription>
            Đơn:{' '}
            <strong className="font-semibold text-foreground tabular-nums">
              {shown?.bookingCode}
            </strong>{' '}
            — Phòng: {shown?.room.name}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={onSubmit} className="grid gap-6">
          <Field
            id="cancelReasonInput"
            label={
              <>
                Lý do hủy đơn <span className="text-destructive">*</span>
              </>
            }
            error={validationError}
          >
            <Textarea
              rows={3}
              data-testid="cancel-reason-input"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Nhập lý do hủy (bắt buộc)..."
              disabled={isSubmitting}
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              data-testid="close-cancel-modal-btn"
              disabled={isSubmitting}
            >
              Đóng
            </Button>
            <Button
              type="submit"
              variant="destructive"
              data-testid="submit-cancel-btn"
              disabled={isSubmitting}
              aria-busy={isSubmitting || undefined}
            >
              {isSubmitting && <Loader2 aria-hidden="true" className="animate-spin" />}
              {isSubmitting ? 'Đang hủy...' : 'Xác nhận hủy đơn'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
