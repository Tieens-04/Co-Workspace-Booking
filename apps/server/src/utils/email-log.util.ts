const safeCodes = new Set([
  'EAUTH',
  'ETIMEDOUT',
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'EDNS',
  'ENOTFOUND',
  'EENVELOPE',
  'EMESSAGE',
  'EPROTOCOL',
  'ESOCKET',
  'ETLS',
]);

export function logEmailFailure(
  operation: 'confirmation' | 'cancellation' | 'admin cancellation',
  bookingCode: string,
  error: unknown,
): void {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const safeCode = typeof code === 'string' && safeCodes.has(code) ? code : 'UNKNOWN';
  console.error(`[Email] ${operation} delivery failed for ${bookingCode}; code=${safeCode}`);
}
