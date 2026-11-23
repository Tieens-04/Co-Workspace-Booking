import { describe, expect, it, vi } from 'vitest';
import * as bookingCodeUtil from '../utils/booking-code.util.js';
import { nextUnusedBookingCode, testBookingCode } from './support/test-booking-code.js';

describe('testBookingCode & nextUnusedBookingCode helpers', () => {
  it('generates distinct uppercase CS-prefixed codes across 10,000 rapid calls on the same date', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      const code = testBookingCode('20261104');
      expect(code).toMatch(/^CS-20261104-[0-9A-F]{8}\d+$/);
      codes.add(code);
    }
    expect(codes.size).toBe(10_000);
  });

  it('skips excluded and already-persisted codes when allocating a canonical 16-char code', async () => {
    const spy = vi
      .spyOn(bookingCodeUtil, 'generateBookingCode')
      .mockReturnValueOnce('CS-20261201-EXCL')
      .mockReturnValueOnce('CS-20261201-USED')
      .mockReturnValueOnce('CS-20261201-FREE');

    const findUnique = vi.fn(async ({ where }: { where: { bookingCode: string } }) =>
      where.bookingCode === 'CS-20261201-USED' ? { id: 'existing' } : null,
    );

    try {
      const code = await nextUnusedBookingCode(
        { booking: { findUnique } },
        new Date('2026-12-01T03:00:00.000Z'),
        ['CS-20261201-EXCL'],
      );
      expect(code).toBe('CS-20261201-FREE');
      expect(findUnique).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });
});
