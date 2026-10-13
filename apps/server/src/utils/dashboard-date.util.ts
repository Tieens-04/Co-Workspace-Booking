import { getDayBounds } from './room-availability.util.js';

/**
 * Returns today's date formatted as YYYY-MM-DD in Vietnam timezone (+07:00).
 */
export function getVietnamTodayString(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Computes start (Monday 00:00:00+07:00) and end (next Monday 00:00:00+07:00)
 * of the week containing the specified dateStr in Vietnam timezone.
 */
export function getWeekBounds(dateStr: string): { weekStart: Date; weekEnd: Date } {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // UTC Date representation of this calendar day
  const targetUtcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = targetUtcDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday

  // Calculate offset to preceding Monday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const mondayUtc = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
  const mYear = mondayUtc.getUTCFullYear();
  const mMonth = String(mondayUtc.getUTCMonth() + 1).padStart(2, '0');
  const mDay = String(mondayUtc.getUTCDate()).padStart(2, '0');

  const mondayStr = `${mYear}-${mMonth}-${mDay}`;
  const { dayStart: weekStart } = getDayBounds(mondayStr);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  return { weekStart, weekEnd };
}
