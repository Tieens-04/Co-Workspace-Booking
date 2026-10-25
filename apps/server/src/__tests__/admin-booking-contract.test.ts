import { describe, it, expect, vi } from 'vitest';
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import {
  AdminBookingReadRecord,
  mapAdminBookingRecordToDto,
} from '../repositories/booking.repository.js';

vi.mock('../utils/prisma.util.js', () => ({ default: {} }));

function fixture(): AdminBookingReadRecord {
  return {
    id: 'booking-id',
    bookingCode: 'CS-20261115-ABCD',
    room: { id: 'room-id', name: 'Meeting room' },
    startTime: new Date('2026-11-15T02:00:00Z'),
    endTime: new Date('2026-11-15T04:00:00Z'),
    checkedInAt: null,
    attendanceTrackingEnabled: true,
    totalAmount: new Prisma.Decimal('400.00'),
    note: null,
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
    paymentMethod: null,
    cancellationReason: null,
    guestName: null,
    guestPhone: null,
    user: {
      id: 'customer-id',
      email: 'customer@example.com',
      fullName: 'Customer',
      phoneNumber: null,
    },
  };
}

describe('Public admin booking customer contract (CWB-46)', () => {
  it('returns only public fields even if a record contains extra private data', () => {
    const base = fixture();
    const record = {
      ...base,
      token: 'private-booking-token',
      user: {
        ...base.user!,
        passwordHash: 'private-hash',
        token: 'private-token',
        role: 'CUSTOMER',
      },
    };
    const dto = mapAdminBookingRecordToDto(record);
    expect(dto.customer).toEqual({
      kind: 'USER',
      name: 'Customer',
      phone: null,
      email: 'customer@example.com',
      id: 'customer-id',
    });
    expect(Object.keys(dto).sort()).toEqual(
      [
        'id',
        'bookingCode',
        'room',
        'startTime',
        'endTime',
        'checkedInAt',
        'attendanceTrackingEnabled',
        'totalAmount',
        'note',
        'status',
        'paymentStatus',
        'paymentMethod',
        'cancellationReason',
        'customer',
      ].sort(),
    );
    expect(dto.totalAmount).toBe('400.00');
    expect(JSON.stringify(dto)).not.toContain('private-');
  });

  it('omits account email and id for a guest', () => {
    const dto = mapAdminBookingRecordToDto({
      ...fixture(),
      user: null,
      guestName: 'Guest',
      guestPhone: '0901112222',
    });
    expect(JSON.parse(JSON.stringify(dto)).customer).toEqual({
      kind: 'GUEST',
      name: 'Guest',
      phone: '0901112222',
    });
  });
});
