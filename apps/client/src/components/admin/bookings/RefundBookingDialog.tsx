import { useEffect, useState } from 'react';
import type * as React from 'react';
import { CircleAlert, Loader2, RotateCcw } from 'lucide-react';
import { AdminBookingItem } from '../../../types/admin-booking';
import { useReturnFocus } from '../../../hooks/useReturnFocus';
import { parsePriceToCents } from '../../../utils/bookingTime';
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

function toAmountCents(raw?: string | null): number {
  return raw ? (parsePriceToCents(raw) ?? 0) : 0;
}

function getRefundBoundsCents(target: AdminBookingItem | null) {
  const totalCents = toAmountCents(target?.totalAmount);
  const alreadyRefundedCents = toAmountCents(target?.refundedAmount);
  const maxRefundableCents = Math.max(0, totalCents - alreadyRefundedCents);
  return { totalCents, alreadyRefundedCents, maxRefundableCents };
}

function formatCentsToAmountInput(cents: number): string {
  if (cents <= 0) return '0';
  if (cents % 100 === 0) return String(cents / 100);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
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

  const { totalCents, alreadyRefundedCents, maxRefundableCents } = getRefundBoundsCents(shown);
  const total = totalCents / 100;
  const alreadyRefunded = alreadyRefundedCents / 100;
  const maxRefundable = maxRefundableCents / 100;
  const maxRefundableInput = formatCentsToAmountInput(maxRefundableCents);

  const [amountStr, setAmountStr] = useState<string>('');
  const [method, setMethod] = useState<RefundMethodValue>('CASH');
  const [reason, setReason] = useState<string>('');
  const [confirmKeyword, setConfirmKeyword] = useState<string>('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [keywordError, setKeywordError] = useState<string | null>(null);

  // Sync state whenever a new booking is opened
  useEffect(() => {
    if (booking) {
      setShown(booking);
      const { maxRefundableCents: bMaxCents } = getRefundBoundsCents(booking);
      setAmountStr(formatCentsToAmountInput(bMaxCents));
      setMethod(booking.paymentMethod === 'QR' ? 'QR' : 'CASH');
      setReason('');
      setConfirmKeyword('');
      setAmountError(null);
      setReasonError(null);
      setKeywordError(null);
    }
  }, [booking]);

  const blockWhileSubmitting = (e: Event) => {
    if (isSubmitting) e.preventDefault();
  };

  const trimmedKeyword = confirmKeyword.trim();
  const isKeywordValid =
    Boolean(shown) &&
    (trimmedKeyword === 'HOÀN TIỀN' ||
      (Boolean(shown?.bookingCode) && trimmedKeyword === shown?.bookingCode));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    let hasError = false;
    let validAmountCents: number | null = null;
    const trimmedAmount = amountStr.trim();

    if (trimmedAmount === '') {
      setAmountError('Vui lòng nhập số tiền hoàn.');
      hasError = true;
    } else {
      const numericPreview = Number(trimmedAmount);
      if (!Number.isNaN(numericPreview) && numericPreview <= 0) {
        setAmountError('Số tiền hoàn phải lớn hơn 0đ.');
        hasError = true;
      } else {
        const parsedCents = parsePriceToCents(trimmedAmount);
        if (parsedCents === null) {
          setAmountError('Số tiền hoàn không hợp lệ (chỉ nhập số, tối đa 2 chữ số thập phân).');
          hasError = true;
        } else if (parsedCents > maxRefundableCents) {
          setAmountError(`Số tiền hoàn không được vượt quá ${formatCurrency(maxRefundable)}.`);
          hasError = true;
        } else {
          setAmountError(null);
          validAmountCents = parsedCents;
        }
      }
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setReasonError('Vui lòng nhập lý do hoàn tiền (tối thiểu 3 ký tự).');
      hasError = true;
    } else if (trimmedReason.length > 500) {
      setReasonError('Lý do hoàn tiền không được vượt quá 500 ký tự.');
      hasError = true;
    } else {
      setReasonError(null);
    }

    if (!isKeywordValid) {
      setKeywordError('Vui lòng nhập "HOÀN TIỀN" hoặc mã đơn đặt phòng để xác nhận.');
      hasError = true;
    } else {
      setKeywordError(null);
    }

    if (hasError || validAmountCents === null) return;

    onSubmit({
      amount: validAmountCents / 100,
      method,
      reason: trimmedReason,
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
              max={maxRefundableInput}
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
            error={keywordError}
          >
            <Input
              id="refundConfirmKeyword"
              data-testid="refund-confirm-keyword"
              value={confirmKeyword}
              onChange={(e) => {
                setConfirmKeyword(e.target.value);
                if (keywordError) setKeywordError(null);
              }}
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
              disabled={isSubmitting}
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
