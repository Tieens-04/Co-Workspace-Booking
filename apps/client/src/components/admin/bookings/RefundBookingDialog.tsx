import { useEffect, useState } from 'react';
import type * as React from 'react';
import { CircleAlert, Loader2, RotateCcw } from 'lucide-react';
import { AdminBookingItem } from '../../../types/admin-booking';
import { useReturnFocus } from '../../../hooks/useReturnFocus';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type RefundMethodValue = 'CASH' | 'QR';

export interface RefundBookingSubmitData {
  amount: number;
  method: RefundMethodValue;
  reason: string;
}

interface RefundBookingDialogProps {
  /** Booking being refunded; `null` closes the dialog. */
  booking: AdminBookingItem | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (data: RefundBookingSubmitData) => void | Promise<void>;
}

export function RefundBookingDialog({
  booking,
  isSubmitting,
  error,
  onClose,
  onSubmit,
}: RefundBookingDialogProps) {
  const [shown, setShown] = useState<AdminBookingItem | null>(booking);
  const returnFocus = useReturnFocus();

  const total = Number(shown?.totalAmount || 0);
  const alreadyRefunded = Number(shown?.refundedAmount || 0);
  const maxRefundable = Math.max(0, total - alreadyRefunded);

  const [amountStr, setAmountStr] = useState<string>('');
  const [method, setMethod] = useState<RefundMethodValue>('CASH');
  const [reason, setReason] = useState<string>('');
  const [confirmKeyword, setConfirmKeyword] = useState<string>('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  // Sync state whenever a new booking is opened
  useEffect(() => {
    if (booking) {
      setShown(booking);
      const bTotal = Number(booking.totalAmount || 0);
      const bRefunded = Number(booking.refundedAmount || 0);
      const bMax = Math.max(0, bTotal - bRefunded);
      setAmountStr(bMax > 0 ? bMax.toString() : '0');
      setMethod(booking.paymentMethod === 'QR' ? 'QR' : 'CASH');
      setReason('');
      setConfirmKeyword('');
      setAmountError(null);
      setReasonError(null);
    }
  }, [booking]);

  const blockWhileSubmitting = (e: Event) => {
    if (isSubmitting) e.preventDefault();
  };

  const parsedAmount = Number(amountStr);
  const isKeywordValid =
    Boolean(shown) &&
    (confirmKeyword.trim() === 'HOÀN TIỀN' ||
      (shown?.bookingCode && confirmKeyword.trim() === shown.bookingCode));

  const isFormValid =
    !Number.isNaN(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= maxRefundable &&
    reason.trim().length >= 3 &&
    isKeywordValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setAmountError('Số tiền hoàn phải lớn hơn 0đ.');
      hasError = true;
    } else if (parsedAmount > maxRefundable) {
      setAmountError(`Số tiền hoàn không được vượt quá ${formatCurrency(maxRefundable)}.`);
      hasError = true;
    } else {
      setAmountError(null);
    }

    if (reason.trim().length < 3) {
      setReasonError('Vui lòng nhập lý do hoàn tiền (tối thiểu 3 ký tự).');
      hasError = true;
    } else if (reason.trim().length > 500) {
      setReasonError('Lý do hoàn tiền không được vượt quá 500 ký tự.');
      hasError = true;
    } else {
      setReasonError(null);
    }

    if (hasError || !isKeywordValid || isSubmitting) return;

    onSubmit({
      amount: parsedAmount,
      method,
      reason: reason.trim(),
    });
  };

  return (
    <Dialog
      open={booking !== null}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent
        data-testid="admin-refund-modal"
        className="sm:max-w-[480px]"
        {...returnFocus}
        onEscapeKeyDown={blockWhileSubmitting}
        onInteractOutside={blockWhileSubmitting}
      >
        <DialogHeader className="text-left sm:text-left">
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw aria-hidden="true" className="size-5 shrink-0 text-status-warning" />
            Ghi nhận hoàn tiền
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

        <div
          data-testid="refund-remaining-info"
          className="rounded-lg border bg-muted/30 p-3.5 text-xs text-muted-foreground space-y-1.5"
        >
          <div className="flex justify-between">
            <span>Tổng tiền đã thu:</span>
            <strong className="text-foreground tabular-nums">{formatCurrency(total)}</strong>
          </div>
          <div className="flex justify-between">
            <span>Đã hoàn trước đó:</span>
            <span className="tabular-nums">{formatCurrency(alreadyRefunded)}</span>
          </div>
          <div className="flex justify-between border-t border-border/60 pt-1.5 font-medium text-foreground">
            <span>Số tiền có thể hoàn tối đa:</span>
            <strong className="text-status-warning tabular-nums">
              {formatCurrency(maxRefundable)}
            </strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <Field
            id="refundAmountInput"
            label={
              <>
                Số tiền hoàn (VNĐ) <span className="text-destructive">*</span>
              </>
            }
            error={amountError}
          >
            <Input
              id="refundAmountInput"
              type="number"
              step="any"
              min="1"
              max={maxRefundable}
              data-testid="refund-amount-input"
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                if (amountError) setAmountError(null);
              }}
              disabled={isSubmitting}
            />
          </Field>

          <Field id="refundMethodSelect" label="Phương thức hoàn tiền">
            <NativeSelect
              id="refundMethodSelect"
              data-testid="refund-method-select"
              value={method}
              onChange={(e) => setMethod(e.target.value as RefundMethodValue)}
              disabled={isSubmitting}
            >
              <option value="CASH">Tiền mặt (CASH)</option>
              <option value="QR">Chuyển khoản / QR (QR)</option>
            </NativeSelect>
          </Field>

          <Field
            id="refundReasonInput"
            label={
              <>
                Lý do hoàn tiền <span className="text-destructive">*</span>
              </>
            }
            error={reasonError}
          >
            <Textarea
              id="refundReasonInput"
              rows={3}
              data-testid="refund-reason-input"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError(null);
              }}
              placeholder="Nhập lý do hoàn tiền..."
              disabled={isSubmitting}
            />
          </Field>

          <Field
            id="refundConfirmKeyword"
            label={
              <>
                Nhập <span className="font-semibold text-destructive">HOÀN TIỀN</span> hoặc mã đơn{' '}
                <span className="font-semibold text-foreground">{shown?.bookingCode}</span> để xác
                nhận
              </>
            }
          >
            <Input
              id="refundConfirmKeyword"
              data-testid="refund-confirm-keyword"
              value={confirmKeyword}
              onChange={(e) => setConfirmKeyword(e.target.value)}
              placeholder="HOÀN TIỀN hoặc mã đơn"
              disabled={isSubmitting}
              autoComplete="off"
            />
          </Field>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              data-testid="cancel-refund-btn"
              disabled={isSubmitting}
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              variant="destructive"
              data-testid="submit-refund-btn"
              disabled={!isFormValid || isSubmitting}
              aria-busy={isSubmitting || undefined}
            >
              {isSubmitting && <Loader2 aria-hidden="true" className="animate-spin" />}
              {isSubmitting ? 'Đang xử lý...' : 'Xác nhận hoàn tiền'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
