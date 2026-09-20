import crypto from 'node:crypto';

export const BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh';
const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function getBookingDateSegment(startDate: Date, timeZone = BUSINESS_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.format(startDate); // 'YYYY-MM-DD'
  return parts.replace(/-/g, '');
}

export function generateRandomAlphanumeric(length = 4): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, ALPHANUMERIC_CHARS.length);
    result += ALPHANUMERIC_CHARS[idx];
  }
  return result;
}

export function generateBookingCode(startDate: Date, timeZone = BUSINESS_TIMEZONE): string {
  const dateSegment = getBookingDateSegment(startDate, timeZone);
  const randomSegment = generateRandomAlphanumeric(4);
  return `CS-${dateSegment}-${randomSegment}`;
}
