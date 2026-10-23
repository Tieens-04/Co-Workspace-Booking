import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { BookingStatus, PaymentStatus, RoomStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { AdminDashboardRepository } from '../repositories/admin-dashboard.repository.js';
import { roomRepository } from '../repositories/room.repository.js';

const roomIds: string[] = [];
const prefix = `cwb42_${randomUUID()}`;
const start = new Date('2026-10-13T17:00:00Z');
const at = (hours: number) => new Date(start.getTime() + hours * 3600000);
const read = () =>
  new AdminDashboardRepository().getKpiData({
    startDate: start,
    endDate: at(24),
    todayStart: start,
    todayEnd: at(24),
  });

async function createRoom(
  status: RoomStatus,
  createdAt: Date,
  events: Array<{ status: RoomStatus; effectiveAt: Date }>,
) {
  const room = await prisma.room.create({
    data: {
      name: prefix,
      capacity: 4,
      pricePerHour: '100',
      status,
      createdAt,
      statusHistory: { create: events },
    },
  });
  roomIds.push(room.id);
  return room;
}

async function createBooking(roomId: string, from: number, to: number) {
  return prisma.booking.create({
    data: {
      roomId,
      bookingCode: `CS-20261014-${randomUUID()}`,
      startTime: at(from),
      endTime: at(to),
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      totalAmount: '100',
    },
  });
}

afterEach(async () => {
  await prisma.booking.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
  roomIds.length = 0;
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('Dashboard occupancy with real MySQL inventory', () => {
  it('clips both sides to availability and retains revenue for maintenance bookings', async () => {
    const baseline = await read();
    const room = await createRoom(RoomStatus.MAINTENANCE, start, [
      { status: RoomStatus.AVAILABLE, effectiveAt: start },
      { status: RoomStatus.MAINTENANCE, effectiveAt: at(9) },
    ]);
    await createBooking(room.id, 8, 10);
    const result = await read();
    expect(result.totalPeriodRoomMinutes - baseline.totalPeriodRoomMinutes).toBe(540);
    expect(result.bookedMinutes - baseline.bookedMinutes).toBe(60);
    expect(Number(result.actualRevenue) - Number(baseline.actualRevenue)).toBe(100);
    expect(result.periodBookingsCount - baseline.periodBookingsCount).toBe(1);
  });

  it('adds only half a day for a room created at midday', async () => {
    const baseline = await read();
    const room = await createRoom(RoomStatus.AVAILABLE, at(12), [
      { status: RoomStatus.AVAILABLE, effectiveAt: at(12) },
    ]);
    await createBooking(room.id, 13, 15);
    const result = await read();
    expect(result.totalPeriodRoomMinutes - baseline.totalPeriodRoomMinutes).toBe(720);
    expect(result.bookedMinutes - baseline.bookedMinutes).toBe(120);
  });

  it('adds zero occupancy for a fully maintained room with a paid booking', async () => {
    const baseline = await read();
    const room = await createRoom(RoomStatus.MAINTENANCE, start, [
      { status: RoomStatus.MAINTENANCE, effectiveAt: start },
    ]);
    await createBooking(room.id, 8, 10);
    const result = await read();
    expect(result.totalPeriodRoomMinutes).toBe(baseline.totalPeriodRoomMinutes);
    expect(result.bookedMinutes).toBe(baseline.bookedMinutes);
    expect(Number(result.actualRevenue) - Number(baseline.actualRevenue)).toBe(100);
  });

  it('does not rewrite past occupancy on maintenance/reopening or duplicate same-state events', async () => {
    const room = await createRoom(RoomStatus.AVAILABLE, start, [
      { status: RoomStatus.AVAILABLE, effectiveAt: start },
    ]);
    await createBooking(room.id, 8, 10);
    const before = await read();
    await roomRepository.updateWithRelations(room.id, { status: RoomStatus.MAINTENANCE });
    await roomRepository.updateWithRelations(room.id, { status: RoomStatus.MAINTENANCE });
    await roomRepository.updateWithRelations(room.id, { status: RoomStatus.AVAILABLE });
    const after = await read();
    expect(after.bookedMinutes).toBe(before.bookedMinutes);
    expect(after.totalPeriodRoomMinutes).toBe(before.totalPeriodRoomMinutes);
    const history = await prisma.roomStatusHistory.findMany({
      where: { roomId: room.id },
      orderBy: { effectiveAt: 'asc' },
    });
    expect(history.map((event) => event.status)).toEqual([
      RoomStatus.AVAILABLE,
      RoomStatus.MAINTENANCE,
      RoomStatus.AVAILABLE,
    ]);
    expect(history[2].effectiveAt.getTime()).toBeGreaterThan(history[1].effectiveAt.getTime());
  });

  it('writes initial history when creating via the room repository', async () => {
    const room = await roomRepository.createWithRelations({
      name: prefix,
      capacity: 4,
      pricePerHour: '100',
    });
    roomIds.push(room.id);
    const persisted = await prisma.room.findUniqueOrThrow({
      where: { id: room.id },
      include: { statusHistory: true },
    });
    expect(persisted.statusHistory).toHaveLength(1);
    expect(persisted.statusHistory[0].status).toBe(RoomStatus.AVAILABLE);
    expect(persisted.statusHistory[0].effectiveAt).toEqual(persisted.createdAt);
  });

  it('returns zero inventory and occupied minutes before any room exists', async () => {
    const result = await new AdminDashboardRepository().getKpiData({
      startDate: new Date('1000-01-01T00:00:00Z'),
      endDate: new Date('1000-01-02T00:00:00Z'),
      todayStart: start,
      todayEnd: at(24),
    });
    expect(result.bookedMinutes).toBe(0);
    expect(result.totalPeriodRoomMinutes).toBe(0);
  });
});
