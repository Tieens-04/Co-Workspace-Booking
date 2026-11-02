import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ADVANCE_NOTICE_MINUTES,
  CANCELLATION_MIN_LEAD_MINUTES,
  CLOSING_HOUR,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  OPENING_HOUR,
  validateBookingTime,
  validateCustomerCancellationTime,
} from '../utils/booking-time.util.js';

// The client mirrors these rules for early feedback; the server stays authoritative.
const clientSource = readFileSync(
  fileURLToPath(new URL('../../../client/src/utils/bookingTime.ts', import.meta.url)),
  'utf8',
);
const clientConst = (name: string): string => {
  const match = new RegExp(`export const ${name} = ([^;]+);`).exec(clientSource);
  if (!match) throw new Error(`client constant ${name} not found`);
  return match[1].trim();
};
const minutesOf = (expr: string): number => {
  // Supports the literal forms used in bookingTime.ts: `60`, `30 * 60 * 1000`, `'07:00'`.
  const time = /^'(\d{2}):(\d{2})'$/.exec(expr);
  if (time) return Number(time[1]) * 60 + Number(time[2]);
  return expr.split('*').reduce((acc, part) => acc * Number(part.trim()), 1);
};

const at = (iso: string) => new Date(iso);

describe('Booking policy parity FE/BE and canonical values (CWB-62)', () => {
  it('uses the canonical 30-minute slot, 1h minimum, 8h maximum and 30-minute lead time', () => {
    expect(MIN_DURATION_MINUTES).toBe(60);
    expect(MAX_DURATION_MINUTES).toBe(480);
    expect(ADVANCE_NOTICE_MINUTES).toBe(30);
    expect(CANCELLATION_MIN_LEAD_MINUTES).toBe(60);
    expect([OPENING_HOUR, CLOSING_HOUR]).toEqual([7, 22]);
  });

  it('keeps client constants identical to the server rules', () => {
    expect(minutesOf(clientConst('SLOT_DURATION_MINUTES'))).toBe(30);
    expect(minutesOf(clientConst('MIN_DURATION_MINUTES'))).toBe(MIN_DURATION_MINUTES);
    expect(minutesOf(clientConst('MAX_DURATION_MINUTES'))).toBe(MAX_DURATION_MINUTES);
    expect(minutesOf(clientConst('MIN_LEAD_TIME_MS')) / 60000).toBe(ADVANCE_NOTICE_MINUTES);
    expect(minutesOf(clientConst('OPENING_TIME'))).toBe(OPENING_HOUR * 60);
    expect(minutesOf(clientConst('CLOSING_TIME'))).toBe(CLOSING_HOUR * 60);
    expect(clientConst('VIETNAM_TIMEZONE')).toBe("'Asia/Ho_Chi_Minh'");
  });

  it('rejects the superseded 4h maximum only above 8h and the 2h cancellation only below 1h', () => {
    const now = at('2026-11-02T00:00:00.000Z'); // 07:00 Vietnam
    // 6h and exactly 8h were invalid under the old 4h rule; both are valid now.
    expect(() =>
      validateBookingTime(at('2026-11-02T02:00:00.000Z'), at('2026-11-02T08:00:00.000Z'), now),
    ).not.toThrow();
    expect(() =>
      validateBookingTime(at('2026-11-02T02:00:00.000Z'), at('2026-11-02T10:00:00.000Z'), now),
    ).not.toThrow();
    expect(() =>
      validateBookingTime(at('2026-11-02T02:00:00.000Z'), at('2026-11-02T10:30:00.000Z'), now),
    ).toThrow(expect.objectContaining({ code: 'MAX_DURATION' }));

    const start = at('2026-11-02T05:00:00.000Z');
    // 90 minutes was rejected under the old 2h rule; exactly 60 minutes is the new boundary.
    expect(() =>
      validateCustomerCancellationTime(start, at('2026-11-02T03:30:00.000Z')),
    ).not.toThrow();
    expect(() =>
      validateCustomerCancellationTime(start, at('2026-11-02T04:00:00.000Z')),
    ).not.toThrow();
    expect(() => validateCustomerCancellationTime(start, at('2026-11-02T04:01:00.000Z'))).toThrow(
      expect.objectContaining({ code: 'CANCELLATION_POLICY_VIOLATION' }),
    );
  });
});
