import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REVENUE_PERIOD_DAYS,
  MAX_REVENUE_PERIOD_DAYS,
  inclusiveDays,
  resolveRevenuePeriod,
} from '../utils/revenue-period.util.js';

// 2026-11-03 01:00 Vietnam time is still 2026-11-02 in UTC: "today" must follow Vietnam.
const now = new Date('2026-11-02T18:00:00Z');

describe('resolveRevenuePeriod (CWB-57)', () => {
  it('defaults to the last 90 Vietnam days ending today', () => {
    const period = resolveRevenuePeriod({}, now);
    expect(period).toEqual({ startDate: '2026-08-06', endDate: '2026-11-03' });
    expect(inclusiveDays(period.startDate, period.endDate)).toBe(DEFAULT_REVENUE_PERIOD_DAYS);
  });

  it('runs an open-ended start through today, or a future start to itself', () => {
    expect(resolveRevenuePeriod({ startDate: '2026-10-01' }, now)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-11-03',
    });
    expect(resolveRevenuePeriod({ startDate: '2026-12-01' }, now)).toEqual({
      startDate: '2026-12-01',
      endDate: '2026-12-01',
    });
  });

  it('looks back 90 days from an end date given alone', () => {
    expect(resolveRevenuePeriod({ endDate: '2026-03-31' }, now)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });
  });

  it('keeps an explicit period and accepts exactly 366 days', () => {
    expect(resolveRevenuePeriod({ startDate: '2027-01-01', endDate: '2028-01-01' }, now)).toEqual({
      startDate: '2027-01-01',
      endDate: '2028-01-01',
    });
    expect(inclusiveDays('2027-01-01', '2028-01-01')).toBe(MAX_REVENUE_PERIOD_DAYS);
  });

  it.each([[{ startDate: '2025-01-01', endDate: '2026-01-02' }], [{ startDate: '2025-01-01' }]])(
    'rejects periods longer than 366 days with 400 VALIDATION_ERROR: %o',
    (filter) => {
      expect(() => resolveRevenuePeriod(filter, now)).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
      );
    },
  );
});
