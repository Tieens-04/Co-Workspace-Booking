import { useState } from 'react';
import type * as React from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { AdminBookingItem } from '../../../types/admin-booking';
import { formatCurrency } from '../../../utils/format';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
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

export type PaymentMethodValue = 'CASH' | 'QR';

interface ConfirmPaymentDialogProps {
  /** Booking being paid; `null` closes the dialog. */
  booking: AdminBookingItem | null;
  paymentMethod: PaymentMethodValue;
  onPaymentMethodChange: (method: PaymentMethodValue) => void;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

/** Modal for marking a booking as paid. Cannot be dismissed while the request is in flight. */
export function ConfirmPaymentDialog({
  booking,
  paymentMethod,
  onPaymentMethodChange,
  isSubmitting,
  error,
  onSubmit,
  onClose,
}: ConfirmPaymentDialogProps) {
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
        data-testid="confirm-payment-modal"
        className="sm:max-w-[440px]"
        onEscapeKeyDown={blockWhileSubmitting}
        onInteractOutside={blockWhileSubmitting}
      >
        <DialogHeader className="text-left sm:text-left">
          <DialogTitle>Xác nhận thanh toán</DialogTitle>
          <DialogDescription>
            Đơn:{' '}
            <strong className="font-semibold text-foreground tabular-nums">
              {shown?.bookingCode}
            </strong>{' '}
            — Số tiền:{' '}
            <strong className="font-semibold text-foreground tabular-nums">
              {shown ? formatCurrency(shown.totalAmount) : ''}
            </strong>
            . Doanh thu chỉ được tính khi đơn đã thanh toán.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={onSubmit} className="grid gap-6">
          <Field id="paymentMethodSelect" label="Phương thức thanh toán">
            <NativeSelect
              data-testid="payment-method-select"
              value={paymentMethod}
              onChange={(e) => onPaymentMethodChange(e.target.value as PaymentMethodValue)}
              disabled={isSubmitting}
            >
              <option value="CASH">Tiền mặt (CASH)</option>
              <option value="QR">Quét mã QR (QR)</option>
            </NativeSelect>
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              data-testid="cancel-payment-btn"
              disabled={isSubmitting}
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              data-testid="submit-payment-btn"
              disabled={isSubmitting}
              aria-busy={isSubmitting || undefined}
            >
              {isSubmitting && <Loader2 aria-hidden="true" className="animate-spin" />}
              {isSubmitting ? 'Đang xác nhận...' : 'Xác nhận thanh toán'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
