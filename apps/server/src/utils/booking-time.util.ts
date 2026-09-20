import { Prisma } from '@prisma/client';
import { AppError } from './error.util.js';

export const MIN_DURATION_MINUTES = 60;
export const MAX_DURATION_MINUTES = 480;
export const ADVANCE_NOTICE_MINUTES = 30;

export function isSlotAligned(date: Date): boolean {
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return (
    date.getUTCMinutes() % 30 === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
  );
}

export function validateBookingTime(startDate: Date, endDate: Date, now = new Date()): void {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new AppError('INVALID_SLOT', 'Thời gian bắt đầu hoặc kết thúc không hợp lệ', 400);
  }

  if (!isSlotAligned(startDate) || !isSlotAligned(endDate)) {
    throw new AppError(
      'INVALID_SLOT',
      'Thời gian bắt đầu và kết thúc phải đúng mốc 30 phút (ví dụ: 09:00, 09:30) với giây bằng 0',
      400,
    );
  }

  if (endDate.getTime() <= startDate.getTime()) {
    throw new AppError('INVALID_SLOT', 'Thời gian kết thúc phải sau thời gian bắt đầu', 400);
  }

  const durationMinutes = (endDate.getTime() - startDate.getTime()) / (60 * 1000);

  if (durationMinutes < MIN_DURATION_MINUTES) {
    throw new AppError(
      'MIN_DURATION',
      `Thời lượng đặt phòng tối thiểu là ${MIN_DURATION_MINUTES / 60} giờ (${MIN_DURATION_MINUTES} phút)`,
      400,
    );
  }

  if (durationMinutes > MAX_DURATION_MINUTES) {
    throw new AppError(
      'MAX_DURATION',
      `Thời lượng đặt phòng tối đa là ${MAX_DURATION_MINUTES / 60} giờ (${MAX_DURATION_MINUTES} phút)`,
      400,
    );
  }

  if (startDate.getTime() <= now.getTime()) {
    throw new AppError('PAST_TIME', 'Thời gian bắt đầu không được ở trong quá khứ', 400);
  }

  const advanceNoticeMs = ADVANCE_NOTICE_MINUTES * 60 * 1000;
  if (startDate.getTime() - now.getTime() < advanceNoticeMs) {
    throw new AppError(
      'ADVANCE_NOTICE',
      `Phải đặt phòng trước thời gian bắt đầu ít nhất ${ADVANCE_NOTICE_MINUTES} phút`,
      400,
    );
  }
}

export function calculateBookingTotal(
  pricePerHour: Prisma.Decimal | string | number,
  durationMinutes: number,
): Prisma.Decimal {
  const price = new Prisma.Decimal(pricePerHour);
  const hours = new Prisma.Decimal(durationMinutes).dividedBy(60);
  const total = price.times(hours);
  return total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
