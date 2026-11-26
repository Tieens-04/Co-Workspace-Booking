import { describe, it, expect } from 'vitest';
import {
  createClosureSchema,
  updateClosureSchema,
  closureIdParamsSchema,
  getClosuresQuerySchema,
} from '../validators/admin-closure.validator.js';

describe('Admin Closure Validators', () => {
  describe('createClosureSchema', () => {
    it('accepts valid facility-wide closure (roomId is null or omitted)', () => {
      const input = {
        startTime: '2026-12-01T08:00:00.000Z',
        endTime: '2026-12-01T18:00:00.000Z',
        reason: 'Nghỉ bảo dưỡng toàn cơ sở',
      };
      const result = createClosureSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.roomId).toBeNull();
        expect(result.data.reason).toBe('Nghỉ bảo dưỡng toàn cơ sở');
        expect(result.data.acknowledgeConflictingBookings).toBe(false);
      }
    });

    it('accepts valid room-specific closure with valid UUID', () => {
      const input = {
        roomId: '11111111-1111-4111-8111-111111111111',
        startTime: '2026-12-01T08:00:00.000Z',
        endTime: '2026-12-01T12:00:00.000Z',
        reason: 'Sửa điều hòa phòng',
        acknowledgeConflictingBookings: true,
      };
      const result = createClosureSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.roomId).toBe('11111111-1111-4111-8111-111111111111');
        expect(result.data.acknowledgeConflictingBookings).toBe(true);
      }
    });

    it('rejects invalid roomId format', () => {
      const input = {
        roomId: 'invalid-uuid',
        startTime: '2026-12-01T08:00:00.000Z',
        endTime: '2026-12-01T12:00:00.000Z',
        reason: 'Bảo trì',
      };
      const result = createClosureSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects endTime <= startTime', () => {
      const input = {
        startTime: '2026-12-01T12:00:00.000Z',
        endTime: '2026-12-01T12:00:00.000Z',
        reason: 'Bảo trì',
      };
      const result = createClosureSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty or whitespace reason', () => {
      const input = {
        startTime: '2026-12-01T08:00:00.000Z',
        endTime: '2026-12-01T12:00:00.000Z',
        reason: '   ',
      };
      const result = createClosureSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects reason exceeding 500 characters', () => {
      const input = {
        startTime: '2026-12-01T08:00:00.000Z',
        endTime: '2026-12-01T12:00:00.000Z',
        reason: 'a'.repeat(501),
      };
      const result = createClosureSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts :00 and :30 bounds across ISO offsets (Z, +07:00, -05:00)', () => {
      for (const [startTime, endTime] of [
        ['2026-12-01T08:00:00.000Z', '2026-12-01T12:30:00.000Z'],
        ['2026-12-01T08:30:00+07:00', '2026-12-01T12:00:00+07:00'],
        ['2026-12-01T08:00:00.000-05:00', '2026-12-01T10:30:00.000-05:00'],
      ]) {
        const result = createClosureSchema.safeParse({
          startTime,
          endTime,
          reason: 'Bảo trì định kỳ',
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects misaligned minutes (10:07, 11:13) on startTime alone, endTime alone, and both', () => {
      const badStart = createClosureSchema.safeParse({
        startTime: '2026-12-01T10:07:00.000+07:00',
        endTime: '2026-12-01T11:30:00.000+07:00',
        reason: 'Bảo trì',
      });
      expect(badStart.success).toBe(false);
      if (!badStart.success) {
        expect(badStart.error.issues.map((i) => i.path)).toEqual([['startTime']]);
      }

      const badEnd = createClosureSchema.safeParse({
        startTime: '2026-12-01T10:00:00.000+07:00',
        endTime: '2026-12-01T11:13:00.000+07:00',
        reason: 'Bảo trì',
      });
      expect(badEnd.success).toBe(false);
      if (!badEnd.success) {
        expect(badEnd.error.issues.map((i) => i.path)).toEqual([['endTime']]);
      }

      const badBoth = createClosureSchema.safeParse({
        startTime: '2026-12-01T10:07:00.000+07:00',
        endTime: '2026-12-01T11:13:00.000+07:00',
        reason: 'Bảo trì',
      });
      expect(badBoth.success).toBe(false);
      if (!badBoth.success) {
        expect(badBoth.error.issues.map((i) => i.path)).toEqual([['startTime'], ['endTime']]);
      }
    });

    it('rejects non-zero seconds and non-zero milliseconds', () => {
      const badSeconds = createClosureSchema.safeParse({
        startTime: '2026-12-01T08:00:01.000Z',
        endTime: '2026-12-01T12:00:00.000Z',
        reason: 'Bảo trì',
      });
      expect(badSeconds.success).toBe(false);
      if (!badSeconds.success) {
        expect(badSeconds.error.issues.map((i) => i.path)).toEqual([['startTime']]);
      }

      const badMs = createClosureSchema.safeParse({
        startTime: '2026-12-01T08:00:00.000Z',
        endTime: '2026-12-01T12:30:00.500Z',
        reason: 'Bảo trì',
      });
      expect(badMs.success).toBe(false);
      if (!badMs.success) {
        expect(badMs.error.issues.map((i) => i.path)).toEqual([['endTime']]);
      }
    });

    it('keeps endTime <= startTime rejection on aligned bounds with endTime path', () => {
      const result = createClosureSchema.safeParse({
        startTime: '2026-12-01T12:00:00.000Z',
        endTime: '2026-12-01T12:00:00.000Z',
        reason: 'Bảo trì',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.path)).toEqual([['endTime']]);
      }
    });
  });

  describe('updateClosureSchema', () => {
    it('accepts partial update of reason', () => {
      const input = { reason: 'Cập nhật lý do' };
      const result = updateClosureSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts legacy misaligned ISO timestamps so repository can allow reason-only edits after lock', () => {
      const result = updateClosureSchema.safeParse({
        startTime: '2024-01-01T10:07:00.000+07:00',
        endTime: '2024-01-01T11:13:00.000+07:00',
        reason: 'Cập nhật ghi chú lịch sử',
      });
      expect(result.success).toBe(true);
    });

    it('rejects malformed ISO timestamps in update payload', () => {
      expect(updateClosureSchema.safeParse({ startTime: 'not-iso' }).success).toBe(false);
      expect(updateClosureSchema.safeParse({ endTime: '2026-12-01T10:00:00' }).success).toBe(false);
    });

    it('rejects update if endTime <= startTime when both provided', () => {
      const input = {
        startTime: '2026-12-01T15:00:00.000Z',
        endTime: '2026-12-01T14:00:00.000Z',
      };
      const result = updateClosureSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty update body {} or only acknowledgeConflictingBookings without any updated field', () => {
      expect(updateClosureSchema.safeParse({}).success).toBe(false);
      expect(updateClosureSchema.safeParse({ acknowledgeConflictingBookings: true }).success).toBe(
        false,
      );
    });
  });

  describe('closureIdParamsSchema', () => {
    it('accepts valid UUID', () => {
      const result = closureIdParamsSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID', () => {
      const result = closureIdParamsSchema.safeParse({ id: 'abc-123' });
      expect(result.success).toBe(false);
    });
  });

  describe('getClosuresQuerySchema', () => {
    it('coerces and defaults pagination query parameters', () => {
      const result = getClosuresQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('parses upcoming boolean flag', () => {
      const result = getClosuresQuerySchema.safeParse({ upcoming: 'true' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.upcoming).toBe(true);
      }
    });

    it('rejects non-numeric page, huge page exceeding MYSQL_INT_MAX offset, or from >= to', () => {
      expect(getClosuresQuerySchema.safeParse({ page: 'true' }).success).toBe(false);
      expect(getClosuresQuerySchema.safeParse({ page: '999999999999' }).success).toBe(false);
      expect(getClosuresQuerySchema.safeParse({ page: '107374184', limit: '20' }).success).toBe(
        false,
      );
      expect(
        getClosuresQuerySchema.safeParse({
          from: '2026-12-02T00:00:00.000Z',
          to: '2026-12-01T00:00:00.000Z',
        }).success,
      ).toBe(false);
    });
  });
});
