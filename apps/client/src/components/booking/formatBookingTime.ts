const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Formats an ISO instant as dd/mm/yyyy hh:mm in Vietnam time; returns the input when invalid. */
export const formatVietnamDateTime = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('vi-VN', {
      timeZone: VN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
};

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VN_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VN_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const weekdayFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VN_TIME_ZONE,
  weekday: 'long',
});

export interface VietnamTimeRange {
  /** dd/mm/yyyy of the start, Vietnam time. */
  startDate: string;
  /** dd/mm/yyyy of the end, Vietnam time. */
  endDate: string;
  /** HH:mm of the start. */
  startTime: string;
  /** HH:mm of the end. */
  endTime: string;
  /** Weekday of the start, e.g. "Thứ Bảy". */
  weekday: string;
  /** Start and end fall on the same Vietnam calendar date. */
  sameDay: boolean;
}

/** Splits a booking interval into display parts in Vietnam time; null when either instant is invalid. */
export function getVietnamTimeRange(startIso: string, endIso: string): VietnamTimeRange | null {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  try {
    const startDate = dateFormatter.format(start);
    const endDate = dateFormatter.format(end);
    const weekday = weekdayFormatter.format(start);
    return {
      startDate,
      endDate,
      startTime: timeFormatter.format(start),
      endTime: timeFormatter.format(end),
      weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
      sameDay: startDate === endDate,
    };
  } catch {
    return null;
  }
}
