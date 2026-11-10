import { Banknote } from 'lucide-react';
import { BookingResult } from '../../types/booking';
import { formatCurrency } from '../../utils/format';
import { DetailList, DetailRow } from './DetailList';
import { Notice } from './Notice';

interface PaymentInstructionsProps {
  booking: Pick<BookingResult, 'status' | 'paymentStatus' | 'paymentInstructions'>;
}

/**
 * CWB-89: how to pay a CONFIRMED, UNPAID booking. Bank details, amount and transfer content all
 * come from the server; the payment is still marked PAID by staff, never by this page.
 */
export function PaymentInstructions({ booking }: PaymentInstructionsProps) {
  if (booking.status !== 'CONFIRMED' || booking.paymentStatus !== 'UNPAID') return null;
  const instructions = booking.paymentInstructions;

  if (!instructions) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Banknote aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Xuất trình mã đặt phòng và thanh toán tại quầy khi đến nhận phòng.
      </p>
    );
  }

  return (
    <Notice tone="info" icon={Banknote} role="note" data-testid="payment-transfer-instructions">
      <p className="font-semibold">Chuyển khoản trước hoặc thanh toán tại quầy</p>
      <p className="mt-1 text-muted-foreground">
        Ghi đúng nội dung chuyển khoản để quầy lễ tân đối soát. Trạng thái chuyển thành “Đã thanh
        toán” sau khi nhân viên xác nhận giao dịch.
      </p>
      <DetailList className="mt-3">
        <DetailRow label="Ngân hàng">
          <span data-testid="payment-bank-name">{instructions.bankName}</span>
        </DetailRow>
        <DetailRow label="Số tài khoản">
          <span className="tabular-nums" data-testid="payment-account-number">
            {instructions.accountNumber}
          </span>
        </DetailRow>
        <DetailRow label="Chủ tài khoản">
          <span data-testid="payment-account-name">{instructions.accountName}</span>
        </DetailRow>
        <DetailRow label="Số tiền">
          <span className="tabular-nums" data-testid="payment-transfer-amount">
            {formatCurrency(instructions.amount)}
          </span>
        </DetailRow>
        <DetailRow label="Nội dung chuyển khoản">
          <strong className="tabular-nums" data-testid="payment-transfer-content">
            {instructions.transferContent}
          </strong>
        </DetailRow>
      </DetailList>
    </Notice>
  );
}
