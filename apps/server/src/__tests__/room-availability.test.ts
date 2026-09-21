import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { RoomStatus } from '@prisma/client';
import app from '../app.js';
import { roomRepository, RoomAvailabilityRecord } from '../repositories/room.repository.js';
import {
  getDayBounds,
  isIntervalOverlapping,
  generateAvailabilitySlots,
  SLOTS_PER_DAY,
} from '../utils/room-availability.util.js';
import { isValidCalendarDate, getRoomAvailabilityQuerySchema } from '../validators/room.validator.js';

vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const validRoomId = '44444444-4444-4444-8444-444444444444';
const nonExistentRoomId = '55555555-5555-4555-8555-555555555555';

const mockAvailabilityFixture = (
  override?: Partial<RoomAvailabilityRecord>,
): RoomAvailabilityRecord => ({
  id: validRoomId,
  status: RoomStatus.AVAILABLE,
  bookings: [],
  ...override,
});

describe('Room Availability Unit & API Tests', () => {
  beforeEach(() => {
    vi.spyOn(roomRepository, 'findAvailabilityById').mockResolvedValue(mockAvailabilityFixture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Date & Calendar Validation Helper', () => {
    it('validates leap years correctly', () => {
      // 2028 is a leap year (divisible by 4, not 100)
      expect(isValidCalendarDate('2028-02-29')).toBe(true);
      // 2000 is a leap year (divisible by 400)
      expect(isValidCalendarDate('2000-02-29')).toBe(true);
      // 2026 is NOT a leap year
      expect(isValidCalendarDate('2026-02-29')).toBe(false);
      // 1900 is NOT a leap year (divisible by 100, not 400)
      expect(isValidCalendarDate('1900-02-29')).toBe(false);
    });

    it('rejects dates with invalid days for month', () => {
      expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidCalendarDate('2026-06-31')).toBe(false); // June has 30 days
      expect(isValidCalendarDate('2026-09-31')).toBe(false); // September has 30 days
      expect(isValidCalendarDate('2026-11-31')).toBe(false); // November has 30 days
      expect(isValidCalendarDate('2026-01-32')).toBe(false); // January has 31 days
      expect(isValidCalendarDate('2026-01-00')).toBe(false);
    });

    it('rejects dates with invalid month', () => {
      expect(isValidCalendarDate('2026-00-15')).toBe(false);
      expect(isValidCalendarDate('2026-13-01')).toBe(false);
    });

    it('rejects invalid format strings', () => {
      expect(isValidCalendarDate('2026/09/21')).toBe(false);
      expect(isValidCalendarDate('21-09-2026')).toBe(false);
      expect(isValidCalendarDate('2026-9-21')).toBe(false);
      expect(isValidCalendarDate('2026-09-21T00:00:00Z')).toBe(false);
      expect(isValidCalendarDate('')).toBe(false);
      expect(isValidCalendarDate('random-string')).toBe(false);
    });

    it('accepts valid calendar dates across month and year boundaries', () => {
      expect(isValidCalendarDate('2026-01-01')).toBe(true);
      expect(isValidCalendarDate('2026-01-31')).toBe(true);
      expect(isValidCalendarDate('2026-02-28')).toBe(true);
      expect(isValidCalendarDate('2026-12-31')).toBe(true);
      expect(isValidCalendarDate('2026-09-21')).toBe(true);
    });

    it('Zod query schema rejects unexpected keys or missing date', () => {
      expect(getRoomAvailabilityQuerySchema.safeParse({}).success).toBe(false);
      expect(getRoomAvailabilityQuerySchema.safeParse({ date: '2026-09-21', extra: 'foo' }).success).toBe(false);
      expect(getRoomAvailabilityQuerySchema.safeParse({ date: '2026-02-29' }).success).toBe(false);
      expect(getRoomAvailabilityQuerySchema.safeParse({ date: '2026-09-21' }).success).toBe(true);
    });
  });

  describe('Slot Generation & Day Bounds Helper', () => {
    it('computes dayStart and dayEnd matching Asia/Ho_Chi_Minh (+07:00)', () => {
      const { dayStart, dayEnd } = getDayBounds('2026-09-21');

      // 2026-09-21 00:00:00 +07:00 is 2026-09-20 17:00:00.000Z
      expect(dayStart.toISOString()).toBe('2026-09-20T17:00:00.000Z');
      // dayEnd is exactly 24h later: 2026-09-21 17:00:00.000Z
      expect(dayEnd.toISOString()).toBe('2026-09-21T17:00:00.000Z');
      expect(dayEnd.getTime() - dayStart.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('handles year rollover for day bounds correctly', () => {
      const { dayStart, dayEnd } = getDayBounds('2026-12-31');
      expect(dayStart.toISOString()).toBe('2026-12-30T17:00:00.000Z');
      expect(dayEnd.toISOString()).toBe('2026-12-31T17:00:00.000Z');
    });

    it('generates exactly 48 contiguous, strictly increasing 30-minute slots', () => {
      const { dayStart, dayEnd } = getDayBounds('2026-09-21');
      const slots = generateAvailabilitySlots(dayStart, dayEnd, []);

      expect(slots).toHaveLength(SLOTS_PER_DAY);
      expect(slots).toHaveLength(48);

      // Verify slot 0
      expect(slots[0].startTime).toBe('2026-09-20T17:00:00.000Z');
      expect(slots[0].endTime).toBe('2026-09-20T17:30:00.000Z');
      expect(slots[0].status).toBe('AVAILABLE');

      // Verify slot 47 (last slot)
      expect(slots[47].startTime).toBe('2026-09-21T16:30:00.000Z');
      expect(slots[47].endTime).toBe('2026-09-21T17:00:00.000Z');
      expect(slots[47].status).toBe('AVAILABLE');

      // Verify contiguity and 30-min duration for all slots
      for (let i = 0; i < slots.length; i++) {
        const start = new Date(slots[i].startTime).getTime();
        const end = new Date(slots[i].endTime).getTime();
        expect(end - start).toBe(30 * 60 * 1000);

        if (i > 0) {
          expect(slots[i].startTime).toBe(slots[i - 1].endTime);
        }
      }
    });
  });

  describe('Interval Overlap Semantics (existing.start < slot.end AND existing.end > slot.start)', () => {
    const slotStart = new Date('2026-09-21T03:00:00.000Z'); // 10:00 VN
    const slotEnd = new Date('2026-09-21T03:30:00.000Z');   // 10:30 VN

    it('partial overlap: booking starts before and ends inside slot -> OVERLAP', () => {
      const bStart = new Date('2026-09-21T02:45:00.000Z');
      const bEnd = new Date('2026-09-21T03:15:00.000Z');
      expect(isIntervalOverlapping(slotStart, slotEnd, bStart, bEnd)).toBe(true);
    });

    it('partial overlap: booking starts inside and ends after slot -> OVERLAP', () => {
      const bStart = new Date('2026-09-21T03:15:00.000Z');
      const bEnd = new Date('2026-09-21T03:45:00.000Z');
      expect(isIntervalOverlapping(slotStart, slotEnd, bStart, bEnd)).toBe(true);
    });

    it('containment: slot is fully inside booking -> OVERLAP', () => {
      const bStart = new Date('2026-09-21T02:00:00.000Z');
      const bEnd = new Date('2026-09-21T05:00:00.000Z');
      expect(isIntervalOverlapping(slotStart, slotEnd, bStart, bEnd)).toBe(true);
    });

    it('containment: booking is fully inside slot -> OVERLAP', () => {
      const bStart = new Date('2026-09-21T03:05:00.000Z');
      const bEnd = new Date('2026-09-21T03:25:00.000Z');
      expect(isIntervalOverlapping(slotStart, slotEnd, bStart, bEnd)).toBe(true);
    });

    it('exact match: booking matches slot exactly -> OVERLAP', () => {
      expect(isIntervalOverlapping(slotStart, slotEnd, slotStart, slotEnd)).toBe(true);
    });

    it('boundary touching: booking ends exactly when slot starts -> NO OVERLAP', () => {
      const bStart = new Date('2026-09-21T02:00:00.000Z');
      const bEnd = slotStart; // 03:00:00
      expect(isIntervalOverlapping(slotStart, slotEnd, bStart, bEnd)).toBe(false);
    });

    it('boundary touching: booking starts exactly when slot ends -> NO OVERLAP', () => {
      const bStart = slotEnd; // 03:30:00
      const bEnd = new Date('2026-09-21T04:30:00.000Z');
      expect(isIntervalOverlapping(slotStart, slotEnd, bStart, bEnd)).toBe(false);
    });

    it('disjoint before or after -> NO OVERLAP', () => {
      const bBeforeStart = new Date('2026-09-21T01:00:00.000Z');
      const bBeforeEnd = new Date('2026-09-21T02:00:00.000Z');
      expect(isIntervalOverlapping(slotStart, slotEnd, bBeforeStart, bBeforeEnd)).toBe(false);

      const bAfterStart = new Date('2026-09-21T04:00:00.000Z');
      const bAfterEnd = new Date('2026-09-21T05:00:00.000Z');
      expect(isIntervalOverlapping(slotStart, slotEnd, bAfterStart, bAfterEnd)).toBe(false);
    });
  });

  describe('Slot Occupancy Scenarios (generateAvailabilitySlots)', () => {
    const { dayStart, dayEnd } = getDayBounds('2026-09-21');

    it('marks exactly 4 slots BOOKED for a 2-hour booking (10:00-12:00 VN)', () => {
      // 10:00 VN = 03:00 UTC, 12:00 VN = 05:00 UTC
      const bookingStart = new Date('2026-09-21T03:00:00.000Z');
      const bookingEnd = new Date('2026-09-21T05:00:00.000Z');

      const slots = generateAvailabilitySlots(dayStart, dayEnd, [
        { startTime: bookingStart, endTime: bookingEnd },
      ]);

      const bookedSlots = slots.filter((s) => s.status === 'BOOKED');
      expect(bookedSlots).toHaveLength(4);

      // 10:00-10:30 VN (03:00-03:30 UTC)
      expect(bookedSlots[0].startTime).toBe('2026-09-21T03:00:00.000Z');
      expect(bookedSlots[0].endTime).toBe('2026-09-21T03:30:00.000Z');

      // 11:30-12:00 VN (04:30-05:00 UTC)
      expect(bookedSlots[3].startTime).toBe('2026-09-21T04:30:00.000Z');
      expect(bookedSlots[3].endTime).toBe('2026-09-21T05:00:00.000Z');

      // Boundary slots: 09:30-10:00 (02:30-03:00 UTC) and 12:00-12:30 (05:00-05:30 UTC) must be AVAILABLE
      const slotBefore = slots.find((s) => s.endTime === '2026-09-21T03:00:00.000Z');
      const slotAfter = slots.find((s) => s.startTime === '2026-09-21T05:00:00.000Z');
      expect(slotBefore?.status).toBe('AVAILABLE');
      expect(slotAfter?.status).toBe('AVAILABLE');
    });

    it('overnight booking from yesterday: marks slot 0 BOOKED', () => {
      // Yesterday 23:30 VN to Today 00:30 VN (Yesterday 16:30 UTC to Today 17:30 UTC on dayStart day)
      // dayStart is 2026-09-20T17:00:00.000Z
      const bStart = new Date('2026-09-20T16:30:00.000Z');
      const bEnd = new Date('2026-09-20T17:30:00.000Z');

      const slots = generateAvailabilitySlots(dayStart, dayEnd, [
        { startTime: bStart, endTime: bEnd },
      ]);

      expect(slots[0].status).toBe('BOOKED');
      expect(slots[1].status).toBe('AVAILABLE');
    });

    it('yesterday booking ending exactly at midnight (dayStart): slot 0 is AVAILABLE', () => {
      const bStart = new Date('2026-09-20T15:00:00.000Z');
      const bEnd = new Date('2026-09-20T17:00:00.000Z'); // Exactly dayStart

      const slots = generateAvailabilitySlots(dayStart, dayEnd, [
        { startTime: bStart, endTime: bEnd },
      ]);

      expect(slots[0].status).toBe('AVAILABLE');
      expect(slots.filter((s) => s.status === 'BOOKED')).toHaveLength(0);
    });

    it('overnight booking into tomorrow: marks slot 47 BOOKED', () => {
      // Today 23:30 VN to Tomorrow 00:30 VN (Today 16:30 UTC to Tomorrow 17:30 UTC)
      // dayEnd is 2026-09-21T17:00:00.000Z
      const bStart = new Date('2026-09-21T16:30:00.000Z');
      const bEnd = new Date('2026-09-21T17:30:00.000Z');

      const slots = generateAvailabilitySlots(dayStart, dayEnd, [
        { startTime: bStart, endTime: bEnd },
      ]);

      expect(slots[47].status).toBe('BOOKED');
      expect(slots[46].status).toBe('AVAILABLE');
    });

    it('tomorrow booking starting exactly at midnight (dayEnd): slot 47 is AVAILABLE', () => {
      const bStart = new Date('2026-09-21T17:00:00.000Z'); // Exactly dayEnd
      const bEnd = new Date('2026-09-21T19:00:00.000Z');

      const slots = generateAvailabilitySlots(dayStart, dayEnd, [
        { startTime: bStart, endTime: bEnd },
      ]);

      expect(slots[47].status).toBe('AVAILABLE');
      expect(slots.filter((s) => s.status === 'BOOKED')).toHaveLength(0);
    });

    it('all-day spanning booking: marks all 48 slots BOOKED', () => {
      const bStart = new Date('2026-09-20T00:00:00.000Z');
      const bEnd = new Date('2026-09-22T00:00:00.000Z');

      const slots = generateAvailabilitySlots(dayStart, dayEnd, [
        { startTime: bStart, endTime: bEnd },
      ]);

      expect(slots).toHaveLength(48);
      expect(slots.every((s) => s.status === 'BOOKED')).toBe(true);
    });

    it('multiple overlapping bookings: still produces exactly 48 non-duplicate slots', () => {
      const b1 = {
        startTime: new Date('2026-09-21T03:00:00.000Z'),
        endTime: new Date('2026-09-21T05:00:00.000Z'),
      };
      const b2 = {
        startTime: new Date('2026-09-21T04:00:00.000Z'),
        endTime: new Date('2026-09-21T06:00:00.000Z'),
      };

      const slots = generateAvailabilitySlots(dayStart, dayEnd, [b1, b2]);

      expect(slots).toHaveLength(48);
      // From 03:00 to 06:00 UTC = 6 slots (03:00, 03:30, 04:00, 04:30, 05:00, 05:30)
      const bookedSlots = slots.filter((s) => s.status === 'BOOKED');
      expect(bookedSlots).toHaveLength(6);
    });
  });

  describe('HTTP API Endpoints: GET /api/v1/rooms/:id/availability', () => {
    it('is public, requires no auth token, and returns 200 with 48 slots', async () => {
      const res = await request(app).get(`/api/v1/rooms/${validRoomId}/availability?date=2026-09-21`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lấy thông tin lịch trống của phòng thành công');
      expect(res.body.data.roomId).toBe(validRoomId);
      expect(res.body.data.date).toBe('2026-09-21');
      expect(res.body.data.timezone).toBe('Asia/Ho_Chi_Minh');
      expect(res.body.data.slots).toHaveLength(48);
      expect(res.body.data.slots[0]).toEqual({
        startTime: '2026-09-20T17:00:00.000Z',
        endTime: '2026-09-20T17:30:00.000Z',
        status: 'AVAILABLE',
      });

      // Ensure no internal fields or PII leaked
      expect(res.body.data.bookings).toBeUndefined();
      expect(res.body.data.slots[0].bookingId).toBeUndefined();
      expect(res.body.data.slots[0].userId).toBeUndefined();
    });

    it('reflects BOOKED status when repository returns blocking intervals', async () => {
      vi.mocked(roomRepository.findAvailabilityById).mockResolvedValue(
        mockAvailabilityFixture({
          bookings: [
            {
              startTime: new Date('2026-09-21T03:00:00.000Z'),
              endTime: new Date('2026-09-21T05:00:00.000Z'),
            },
          ],
        }),
      );

      const res = await request(app).get(`/api/v1/rooms/${validRoomId}/availability?date=2026-09-21`);

      expect(res.status).toBe(200);
      const bookedSlots = res.body.data.slots.filter(
        (s: { status: string }) => s.status === 'BOOKED',
      );
      expect(bookedSlots).toHaveLength(4);
    });

    it('returns 404 ROOM_NOT_FOUND when room does not exist', async () => {
      vi.mocked(roomRepository.findAvailabilityById).mockResolvedValue(null);

      const res = await request(app).get(
        `/api/v1/rooms/${nonExistentRoomId}/availability?date=2026-09-21`,
      );

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ROOM_NOT_FOUND');
      expect(res.body.message).toBe('Không tìm thấy phòng');
    });

    it('returns 409 ROOM_NOT_AVAILABLE when room status is MAINTENANCE', async () => {
      vi.mocked(roomRepository.findAvailabilityById).mockResolvedValue(
        mockAvailabilityFixture({
          status: RoomStatus.MAINTENANCE,
        }),
      );

      const res = await request(app).get(`/api/v1/rooms/${validRoomId}/availability?date=2026-09-21`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
    });

    it('returns 400 VALIDATION_ERROR when room ID is not a valid UUID', async () => {
      const res = await request(app).get('/api/v1/rooms/not-a-uuid/availability?date=2026-09-21');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(roomRepository.findAvailabilityById).not.toHaveBeenCalled();
    });

    it.each([
      { query: '', desc: 'missing date query param' },
      { query: '?date=', desc: 'empty date' },
      { query: '?date=2026-02-29', desc: 'invalid leap day (2026-02-29)' },
      { query: '?date=2026-04-31', desc: 'day 31 in 30-day month' },
      { query: '?date=2026-13-01', desc: 'month 13' },
      { query: '?date=2026-00-10', desc: 'month 0' },
      { query: '?date=21/09/2026', desc: 'wrong date format' },
      { query: '?date=2026-09-21T00:00:00Z', desc: 'ISO timestamp instead of date' },
      { query: '?date=2026-09-21&extra=param', desc: 'unwhitelisted query parameter' },
      { query: '?date=2026-09-21&page=1', desc: 'unwhitelisted page parameter' },
    ])('returns 400 VALIDATION_ERROR for invalid query: $desc', async ({ query }) => {
      const res = await request(app).get(`/api/v1/rooms/${validRoomId}/availability${query}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(roomRepository.findAvailabilityById).not.toHaveBeenCalled();
    });
  });
});
