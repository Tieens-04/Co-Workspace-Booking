import { AppError } from './error.util.js';
import { getVietnamTodayString } from './dashboard-date.util.js';

/** Window used when the caller sends no period (CWB-57). */
export const DEFAULT_REVENUE_PERIOD_DAYS = 90;
/** Longest period one revenue request may aggregate, inclusive of both days. */
export const MAX_REVENUE_PERIOD_DAYS = 366;

const DAY_MS = 86_400_000;
const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const shiftDays = (date: string, days: number) =>
  new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);

/** Inclusive number of calendar days between two YYYY-MM-DD strings. */
export const inclusiveDays = (start: string, end: string) =>
  Math.round((toUtc(end) - toUtc(start)) / DAY_MS) + 1;

/**
 * Resolves the Vietnam-date period for GET /admin/revenue so a request never scans the whole
 * bookings table:
 * - none given      → the last 90 days ending today;
 * - only startDate  → through today (or startDate itself when it is in the future);
 * - only endDate    → the 90 days ending on endDate;
 * - both            → as given.
 * A resolved period longer than 366 days is rejected with 400.
 */
export function resolveRevenuePeriod(
  filter: { startDate?: string; endDate?: string },
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  const today = getVietnamTodayString(now);
  const lookback = DEFAULT_REVENUE_PERIOD_DAYS - 1;
  let { startDate, endDate } = filter;
  if (!startDate && !endDate) {
    endDate = today;
    startDate = shiftDays(today, -lookback);
  } else if (startDate && !endDate) {
    endDate = startDate > today ? startDate : today;
  } else if (!startDate && endDate) {
    startDate = shiftDays(endDate, -lookback);
  }
  if (inclusiveDays(startDate!, endDate!) > MAX_REVENUE_PERIOD_DAYS) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Kỳ báo cáo doanh thu tối đa ${MAX_REVENUE_PERIOD_DAYS} ngày`,
      400,
      [{ field: 'startDate', message: `Kỳ báo cáo tối đa ${MAX_REVENUE_PERIOD_DAYS} ngày` }],
    );
  }
  return { startDate: startDate!, endDate: endDate! };
}
