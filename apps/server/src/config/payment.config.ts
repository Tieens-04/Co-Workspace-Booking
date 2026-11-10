/** Bank account customers transfer to (CWB-89). Public business data, not a secret. */
export interface PaymentAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

type PaymentEnv = Partial<
  Record<'PAYMENT_BANK_NAME' | 'PAYMENT_ACCOUNT_NUMBER' | 'PAYMENT_ACCOUNT_NAME', string>
>;

const FIELDS = ['PAYMENT_BANK_NAME', 'PAYMENT_ACCOUNT_NUMBER', 'PAYMENT_ACCOUNT_NAME'] as const;
const ACCOUNT_NUMBER = /^[0-9]{6,20}$/;
const MAX_TEXT = 100;

/**
 * Transfer instructions are shown only when all three variables are set; none set disables them.
 * A partial or malformed configuration fails at startup instead of showing wrong bank details.
 */
export function parsePaymentConfig(env: PaymentEnv): PaymentAccount | null {
  const values = Object.fromEntries(FIELDS.map((key) => [key, (env[key] ?? '').trim()])) as Record<
    (typeof FIELDS)[number],
    string
  >;
  if (FIELDS.every((key) => values[key] === '')) return null;

  const missing = FIELDS.filter((key) => values[key] === '');
  if (missing.length > 0) {
    throw new Error(`Payment account is partially configured; missing: ${missing.join(', ')}`);
  }
  if (!ACCOUNT_NUMBER.test(values.PAYMENT_ACCOUNT_NUMBER)) {
    throw new Error('PAYMENT_ACCOUNT_NUMBER must be 6-20 digits.');
  }
  for (const key of ['PAYMENT_BANK_NAME', 'PAYMENT_ACCOUNT_NAME'] as const) {
    if (values[key].length > MAX_TEXT)
      throw new Error(`${key} must be at most ${MAX_TEXT} characters.`);
  }
  return {
    bankName: values.PAYMENT_BANK_NAME,
    accountNumber: values.PAYMENT_ACCOUNT_NUMBER,
    accountName: values.PAYMENT_ACCOUNT_NAME,
  };
}
