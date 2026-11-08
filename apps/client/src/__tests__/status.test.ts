import { describe, it, expect } from 'vitest';
import {
  getCancellationActorLabel,
  getStatusMeta,
  getPaymentMethodLabel,
  BOOKING_STATUS_META,
  PAYMENT_STATUS_META,
  ROOM_STATUS_META,
} from '../utils/status';

describe('status utilities', () => {
  describe('getCancellationActorLabel', () => {
    it('returns "Đã hủy bởi Co-Space" when cancelledBy is ADMIN', () => {
      expect(getCancellationActorLabel('ADMIN', null)).toBe('Đã hủy bởi Co-Space');
      expect(getCancellationActorLabel('ADMIN', 'Phòng cần bảo trì')).toBe('Đã hủy bởi Co-Space');
    });

    it('returns "Đã hủy bởi Co-Space" for legacy bookings when cancelledBy is null but cancellationReason exists', () => {
      expect(getCancellationActorLabel(null, 'Lý do cũ do admin nhập')).toBe('Đã hủy bởi Co-Space');
      expect(getCancellationActorLabel(undefined, 'Lý do cũ do admin nhập')).toBe(
        'Đã hủy bởi Co-Space',
      );
    });

    it('returns "Bạn đã hủy" when cancelledBy is CUSTOMER', () => {
      expect(getCancellationActorLabel('CUSTOMER', null)).toBe('Bạn đã hủy');
      expect(getCancellationActorLabel('CUSTOMER', undefined)).toBe('Bạn đã hủy');
    });

    it('returns null when neither cancelledBy nor cancellationReason is present', () => {
      expect(getCancellationActorLabel(null, null)).toBeNull();
      expect(getCancellationActorLabel(undefined, undefined)).toBeNull();
      expect(getCancellationActorLabel(null, '')).toBeNull();
      expect(getCancellationActorLabel(null, '   ')).toBeNull();
    });

    it('defensively returns null for unknown/future roles without reason', () => {
      expect(getCancellationActorLabel('SYSTEM' as any, null)).toBeNull();
      expect(getCancellationActorLabel('UNKNOWN' as any, null)).toBeNull();
    });
  });

  describe('getStatusMeta', () => {
    it('returns correct meta for booking statuses', () => {
      expect(getStatusMeta('booking', 'CONFIRMED')).toEqual(BOOKING_STATUS_META.CONFIRMED);
      expect(getStatusMeta('booking', 'CANCELLED')).toEqual(BOOKING_STATUS_META.CANCELLED);
    });

    it('returns correct meta for payment statuses', () => {
      expect(getStatusMeta('payment', 'PAID')).toEqual(PAYMENT_STATUS_META.PAID);
      expect(getStatusMeta('payment', 'UNPAID')).toEqual(PAYMENT_STATUS_META.UNPAID);
    });

    it('returns correct meta for room statuses', () => {
      expect(getStatusMeta('room', 'AVAILABLE')).toEqual(ROOM_STATUS_META.AVAILABLE);
      expect(getStatusMeta('room', 'MAINTENANCE')).toEqual(ROOM_STATUS_META.MAINTENANCE);
    });

    it('falls back to neutral tone for unknown statuses', () => {
      expect(getStatusMeta('booking', 'ARCHIVED')).toEqual({
        label: 'ARCHIVED',
        tone: 'neutral',
      });
    });
  });

  describe('getPaymentMethodLabel', () => {
    it('formats known payment methods', () => {
      expect(getPaymentMethodLabel('CASH')).toBe('Tiền mặt');
      expect(getPaymentMethodLabel('QR')).toBe('Chuyển khoản QR');
      expect(getPaymentMethodLabel(null)).toBe('Chưa có');
      expect(getPaymentMethodLabel('MOMO')).toBe('MOMO');
    });
  });
});
