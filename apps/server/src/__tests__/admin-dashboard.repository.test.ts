import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus, PaymentStatus, Prisma, RoomStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { AdminDashboardRepository } from '../repositories/admin-dashboard.repository.js';

vi.mock('../utils/prisma.util.js', () => {
  const db = {
    room: { count: vi.fn(), findMany: vi.fn() },
    booking: { count: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { default: db };
});

const start = new Date('2026-10-13T17:00:00Z');
const end = new Date('2026-10-14T17:00:00Z');
const at = (hours: number) => new Date(start.getTime() + hours * 3600000);
const room = (status: RoomStatus = RoomStatus.AVAILABLE, createdAt = start) => ({
  id: 'room-1',
  status,
  createdAt,
  statusHistory: [{ status, effectiveAt: createdAt }],
});
const booking = (from = 8, to = 10, status: BookingStatus = BookingStatus.COMPLETED) => ({
  id: 'booking-1',
  roomId: 'room-1',
  status,
  paymentStatus: PaymentStatus.PAID,
  totalAmount: new Prisma.Decimal('100'),
  startTime: at(from),
  endTime: at(to),
});
const read = () =>
  new AdminDashboardRepository().getKpiData({
    startDate: start,
    endDate: end,
    todayStart: start,
    todayEnd: end,
  });

describe('Dashboard inventory over time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: unknown) =>
        (callback as (db: typeof prisma) => Promise<unknown>)(prisma) as never,
    );
    vi.mocked(prisma.room.count).mockResolvedValue(1);
    vi.mocked(prisma.booking.count).mockResolvedValue(1);
    vi.mocked(prisma.room.findMany).mockResolvedValue([room()] as never);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([booking()] as never);
  });

  it('excludes maintenance bookings from occupancy but preserves paid revenue and counts', async () => {
    vi.mocked(prisma.room.count).mockResolvedValue(0);
    vi.mocked(prisma.room.findMany).mockResolvedValue([room(RoomStatus.MAINTENANCE)] as never);
    const result = await read();
    expect(result.bookedMinutes).toBe(0);
    expect(result.totalPeriodRoomMinutes).toBe(0);
    expect(result.actualRevenue).toBe('100.00');
    expect(result.periodBookingsCount).toBe(1);
  });

  it('keeps past occupancy when the current room status is maintenance', async () => {
    const fixture = room();
    fixture.status = RoomStatus.MAINTENANCE;
    fixture.statusHistory.push({ status: RoomStatus.MAINTENANCE, effectiveAt: at(24) });
    vi.mocked(prisma.room.findMany).mockResolvedValue([fixture] as never);
    vi.mocked(prisma.room.count).mockResolvedValue(0);
    const result = await read();
    expect(result.bookedMinutes).toBe(120);
    expect(result.totalPeriodRoomMinutes).toBe(1440);
  });

  it('only counts inventory after room creation inside the period', async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      room(RoomStatus.AVAILABLE, at(12)),
    ] as never);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([booking(13, 15)] as never);
    const result = await read();
    expect(result.totalPeriodRoomMinutes).toBe(720);
    expect(result.bookedMinutes).toBe(120);
  });

  it('clips bookings to available intervals across maintenance and reopening boundaries', async () => {
    const fixture = room();
    fixture.statusHistory.push(
      { status: RoomStatus.MAINTENANCE, effectiveAt: at(9) },
      { status: RoomStatus.AVAILABLE, effectiveAt: at(11) },
    );
    vi.mocked(prisma.room.findMany).mockResolvedValue([fixture] as never);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([booking(8, 12)] as never);
    const result = await read();
    expect(result.totalPeriodRoomMinutes).toBe(1320);
    expect(result.bookedMinutes).toBe(120);
  });

  it('returns zero with no rooms', async () => {
    vi.mocked(prisma.room.count).mockResolvedValue(0);
    vi.mocked(prisma.room.findMany).mockResolvedValue([]);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([]);
    const result = await read();
    expect(result.totalPeriodRoomMinutes).toBe(0);
    expect(result.bookedMinutes).toBe(0);
  });

  it('clips at period boundaries and excludes cancelled/no-show bookings', async () => {
    vi.mocked(prisma.booking.findMany).mockResolvedValue([
      booking(-1, 1),
      booking(23, 25),
      booking(5, 6, BookingStatus.CANCELLED),
      booking(6, 7, BookingStatus.NO_SHOW),
    ] as never);
    expect((await read()).bookedMinutes).toBe(120);
  });

  it('uses the last state before the period and preserves fractional minutes', async () => {
    const fixture = room(RoomStatus.MAINTENANCE, at(-24));
    fixture.statusHistory.push({ status: RoomStatus.AVAILABLE, effectiveAt: at(-1) });
    fixture.statusHistory.push({
      status: RoomStatus.MAINTENANCE,
      effectiveAt: new Date(at(9).getTime() + 30000),
    });
    vi.mocked(prisma.room.findMany).mockResolvedValue([fixture] as never);
    const result = await read();
    expect(result.bookedMinutes).toBe(60.5);
    expect(result.totalPeriodRoomMinutes).toBe(540.5);
  });

  it('handles multiple rooms over a week with creation and maintenance mid-period', async () => {
    const first = room(RoomStatus.AVAILABLE, at(-24));
    first.statusHistory.push({ status: RoomStatus.MAINTENANCE, effectiveAt: at(72) });
    const second = { ...room(RoomStatus.AVAILABLE, at(96)), id: 'room-2' };
    vi.mocked(prisma.room.findMany).mockResolvedValue([first, second] as never);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([
      booking(71, 73),
      { ...booking(97, 99), roomId: 'room-2' },
    ] as never);
    const result = await new AdminDashboardRepository().getKpiData({
      startDate: start,
      endDate: at(168),
      todayStart: start,
      todayEnd: end,
    });
    expect(result.totalPeriodRoomMinutes).toBe(144 * 60);
    expect(result.bookedMinutes).toBe(180);
  });
});
