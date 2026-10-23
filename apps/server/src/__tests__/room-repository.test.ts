import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomStatus } from '@prisma/client';
import { roomRepository } from '../repositories/room.repository.js';

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  room: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  roomStatusHistory: { findFirst: vi.fn() },
  booking: { findMany: vi.fn() },
}));

vi.mock('../utils/prisma.util.js', () => ({
  default: {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  },
}));

describe('Room status history persistence', () => {
  const now = new Date('2026-10-23T08:00:00.000Z');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    tx.$queryRaw.mockResolvedValue([
      { id: 'room-1', name: 'Room', status: RoomStatus.AVAILABLE, price_per_hour: '100.00' },
    ]);
    tx.room.findUnique.mockResolvedValue({ id: 'room-1' });
    tx.booking.findMany.mockResolvedValue([]);
    tx.roomStatusHistory.findFirst.mockResolvedValue({
      effectiveAt: new Date(now.getTime() - 1000),
    });
  });

  afterEach(() => vi.useRealTimers());

  it('creates the initial AVAILABLE history atomically at the room creation time', async () => {
    await roomRepository.createWithRelations({ name: 'Room', capacity: 4, pricePerHour: '100.00' });

    expect(tx.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RoomStatus.AVAILABLE,
          createdAt: now,
          statusHistory: { create: { status: RoomStatus.AVAILABLE, effectiveAt: now } },
        }),
      }),
    );
  });

  it('records a transition with the status update using the time after the room lock', async () => {
    const afterLock = new Date(now.getTime() + 5000);
    tx.$queryRaw.mockImplementation(async () => {
      vi.setSystemTime(afterLock);
      return [
        { id: 'room-1', name: 'Room', status: RoomStatus.AVAILABLE, price_per_hour: '100.00' },
      ];
    });

    await roomRepository.updateWithRelations('room-1', { status: RoomStatus.MAINTENANCE });

    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: {
        status: RoomStatus.MAINTENANCE,
        statusHistory: { create: { status: RoomStatus.MAINTENANCE, effectiveAt: afterLock } },
      },
    });
  });

  it('preserves transition order when two transitions share a millisecond', async () => {
    tx.roomStatusHistory.findFirst.mockResolvedValue({ effectiveAt: now });

    await roomRepository.updateWithRelations('room-1', { status: RoomStatus.MAINTENANCE });

    expect(tx.room.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusHistory: {
            create: { status: RoomStatus.MAINTENANCE, effectiveAt: new Date(now.getTime() + 1) },
          },
        }),
      }),
    );
  });

  it('records a return from maintenance to available', async () => {
    tx.$queryRaw.mockResolvedValue([
      { id: 'room-1', name: 'Room', status: RoomStatus.MAINTENANCE, price_per_hour: '100.00' },
    ]);

    await roomRepository.updateWithRelations('room-1', { status: RoomStatus.AVAILABLE });

    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: {
        status: RoomStatus.AVAILABLE,
        statusHistory: { create: { status: RoomStatus.AVAILABLE, effectiveAt: now } },
      },
    });
    expect(tx.booking.findMany).not.toHaveBeenCalled();
  });

  it.each([{ status: RoomStatus.AVAILABLE }, { name: 'Renamed Room' }])(
    'does not add history when status does not change: %j',
    async (data) => {
      await roomRepository.updateWithRelations('room-1', data);

      expect(tx.roomStatusHistory.findFirst).not.toHaveBeenCalled();
      expect(tx.room.update).toHaveBeenCalledWith({ where: { id: 'room-1' }, data });
    },
  );

  it('does not persist a status or history change when maintenance requires acknowledgement', async () => {
    tx.booking.findMany.mockResolvedValue([
      {
        bookingCode: 'CS-20261024-ABCD',
        startTime: new Date('2026-10-24T08:00:00Z'),
        endTime: new Date('2026-10-24T09:00:00Z'),
      },
    ]);

    await expect(
      roomRepository.updateWithRelations('room-1', {
        status: RoomStatus.MAINTENANCE,
      }),
    ).rejects.toMatchObject({ code: 'ROOM_HAS_FUTURE_BOOKINGS', statusCode: 409 });

    expect(tx.room.update).not.toHaveBeenCalled();
    expect(tx.roomStatusHistory.findFirst).not.toHaveBeenCalled();
  });
});
