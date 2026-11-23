import { randomUUID } from 'node:crypto';
import { generateBookingCode } from '../../utils/booking-code.util.js';

let sequence = 0;

interface BookingCodeLookup {
  booking: {
    findUnique(args: { where: { bookingCode: string } }): Promise<unknown>;
  };
}

/**
 * Generates a collision-free booking code for direct Prisma test fixtures.
 * Combines 32 bits of random hex with a strictly monotonic sequence counter so two
 * calls in the same worker can never collide, even under identical timestamps/dates.
 */
export function testBookingCode(dateSegment = '20261104'): string {
  sequence += 1;
  const token = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `CS-${dateSegment}-${token}${sequence}`;
}

/**
 * Picks a canonical 16-character `CS-YYYYMMDD-XXXX` booking code verified to be
 * absent from both `exclude` and the live test database (for collision-retry tests).
 */
export async function nextUnusedBookingCode(
  db: BookingCodeLookup,
  startDate: Date,
  exclude: Iterable<string> = [],
): Promise<string> {
  const excluded = new Set(exclude);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = generateBookingCode(startDate);
    if (excluded.has(candidate)) continue;
    const existing = await db.booking.findUnique({ where: { bookingCode: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Unable to allocate an unused canonical bookingCode after 50 attempts');
}
