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
  });

  describe('updateClosureSchema', () => {
    it('accepts partial update of reason', () => {
      const input = { reason: 'Cập nhật lý do' };
      const result = updateClosureSchema.safeParse(input);
      expect(result.success).toBe(true);
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
      expect(
        updateClosureSchema.safeParse({ acknowledgeConflictingBookings: true }).success,
      ).toBe(false);
    });
  });

  describe('closureIdParamsSchema', () => {
    it('accepts valid UUID', () => {
      const result = closureIdParamsSchema.safeParse({ id: '11111111-1111-4111-8111-111111111111' });
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
