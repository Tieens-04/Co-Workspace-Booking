import { describe, expect, it } from 'vitest';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { parsePaymentConfig } from '../config/payment.config.js';
import { paymentInstructionsFor } from '../utils/payment-instructions.util.js';

const configured = {
  PAYMENT_BANK_NAME: ' Vietcombank ',
  PAYMENT_ACCOUNT_NUMBER: '0123456789',
  PAYMENT_ACCOUNT_NAME: 'CONG TY CO SPACE',
};

describe('payment receiving account configuration (CWB-89)', () => {
  it('is disabled when no variable is set', () => {
    expect(parsePaymentConfig({})).toBeNull();
    expect(
      parsePaymentConfig({
        PAYMENT_BANK_NAME: '',
        PAYMENT_ACCOUNT_NUMBER: ' ',
        PAYMENT_ACCOUNT_NAME: '',
      }),
    ).toBeNull();
  });

  it('returns the trimmed account when all three are set', () => {
    expect(parsePaymentConfig(configured)).toEqual({
      bankName: 'Vietcombank',
      accountNumber: '0123456789',
      accountName: 'CONG TY CO SPACE',
    });
  });

  it.each([
    [{ ...configured, PAYMENT_ACCOUNT_NAME: '' }, 'PAYMENT_ACCOUNT_NAME'],
    [{ PAYMENT_BANK_NAME: 'Vietcombank' }, 'PAYMENT_ACCOUNT_NUMBER'],
    [{ ...configured, PAYMENT_ACCOUNT_NUMBER: '0123-456' }, 'PAYMENT_ACCOUNT_NUMBER'],
    [{ ...configured, PAYMENT_ACCOUNT_NUMBER: '123' }, 'PAYMENT_ACCOUNT_NUMBER'],
    [{ ...configured, PAYMENT_BANK_NAME: 'x'.repeat(101) }, 'PAYMENT_BANK_NAME'],
  ])('rejects a partial or invalid configuration (%#)', (env, field) => {
    expect(() => parsePaymentConfig(env)).toThrow(field);
  });
});

describe('paymentInstructionsFor (CWB-89)', () => {
  const account = parsePaymentConfig(configured);
  const booking = {
    bookingCode: 'CS-20261120-ABCD',
    totalAmount: '250000.00',
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
  };

  it('uses the booking code as transfer content and the server-calculated amount', () => {
    expect(paymentInstructionsFor(booking, account)).toEqual({
      bankName: 'Vietcombank',
      accountNumber: '0123456789',
      accountName: 'CONG TY CO SPACE',
      transferContent: 'CS-20261120-ABCD',
      amount: '250000.00',
    });
  });

  it.each([
    ['paid', { paymentStatus: PaymentStatus.PAID }],
    ['cancelled', { status: BookingStatus.CANCELLED }],
    ['completed', { status: BookingStatus.COMPLETED }],
    ['no-show', { status: BookingStatus.NO_SHOW }],
  ])('returns null for a %s booking', (_label, override) => {
    expect(paymentInstructionsFor({ ...booking, ...override }, account)).toBeNull();
  });

  it('returns null when no receiving account is configured', () => {
    expect(paymentInstructionsFor(booking, null)).toBeNull();
  });
});
