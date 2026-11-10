import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaymentInstructions } from '../components/booking/PaymentInstructions';
import type { BookingResult } from '../types/booking';

const instructions = {
  bankName: 'Vietcombank',
  accountNumber: '0123456789',
  accountName: 'CONG TY CO SPACE',
  transferContent: 'CS-20261120-ABCD',
  amount: '250000.00',
};

type Props = Pick<BookingResult, 'status' | 'paymentStatus' | 'paymentInstructions'>;
const unpaid: Props = {
  status: 'CONFIRMED',
  paymentStatus: 'UNPAID',
  paymentInstructions: instructions,
};

describe('PaymentInstructions (CWB-89)', () => {
  it('shows the bank account, server amount and booking code as transfer content', () => {
    render(<PaymentInstructions booking={unpaid} />);

    const block = screen.getByTestId('payment-transfer-instructions');
    expect(block).toHaveAttribute('role', 'note');
    expect(screen.getByTestId('payment-bank-name')).toHaveTextContent('Vietcombank');
    expect(screen.getByTestId('payment-account-number')).toHaveTextContent('0123456789');
    expect(screen.getByTestId('payment-account-name')).toHaveTextContent('CONG TY CO SPACE');
    expect(screen.getByTestId('payment-transfer-amount')).toHaveTextContent(/250\.000/);
    expect(screen.getByTestId('payment-transfer-content')).toHaveTextContent('CS-20261120-ABCD');
    expect(block).toHaveTextContent('sau khi nhân viên xác nhận');
  });

  it('falls back to counter payment when no receiving account is configured', () => {
    render(<PaymentInstructions booking={{ ...unpaid, paymentInstructions: null }} />);

    expect(screen.queryByTestId('payment-transfer-instructions')).not.toBeInTheDocument();
    expect(screen.getByText(/thanh toán tại quầy khi đến nhận phòng/)).toBeInTheDocument();
  });

  it.each([
    ['paid', { paymentStatus: 'PAID' }],
    ['cancelled', { status: 'CANCELLED' }],
    ['completed', { status: 'COMPLETED' }],
  ])('renders nothing for a %s booking', (_label, override) => {
    const { container } = render(<PaymentInstructions booking={{ ...unpaid, ...override }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
