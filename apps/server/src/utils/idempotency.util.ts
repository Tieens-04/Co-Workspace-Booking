import { createHash } from 'node:crypto';
import { AppError } from './error.util.js';

/** Client-chosen retry token for booking creation (CWB-66), e.g. a UUID. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface BookingIdempotency {
  /** `user:<id>` or `admin:<id>`: one caller can never replay another caller's booking. */
  scope: string;
  key: string;
  /** SHA-256 of the normalized create payload. */
  hash: string;
}

/** Reads the optional `Idempotency-Key` header; malformed values are rejected with 400. */
export function parseIdempotencyKey(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const key = header.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Idempotency-Key phải gồm 8-64 ký tự chữ, số, "-" hoặc "_"',
      400,
    );
  }
  return key;
}

/** Stable hash of the booking intent; identical retries hash identically. */
export function hashBookingIntent(intent: {
  roomId: string;
  startTime: string;
  endTime: string;
  note?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
}): string {
  const normalized = {
    roomId: intent.roomId,
    startTime: new Date(intent.startTime).toISOString(),
    endTime: new Date(intent.endTime).toISOString(),
    note: intent.note?.trim() || null,
    guestName: intent.guestName?.trim() || null,
    guestPhone: intent.guestPhone?.trim() || null,
  };
  return createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex');
}

export const idempotencyKeyReused = () =>
  new AppError(
    'IDEMPOTENCY_KEY_REUSED',
    'Idempotency-Key đã được dùng cho một yêu cầu đặt phòng khác',
    409,
  );
