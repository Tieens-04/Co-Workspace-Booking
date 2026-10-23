import { BookingStatus, RoomStatus } from '@prisma/client';

interface InventoryRoom {
  id: string;
  createdAt: Date;
  statusHistory: Array<{ status: RoomStatus; effectiveAt: Date }>;
}

interface OccupancyBooking {
  roomId: string;
  status: BookingStatus;
  startTime: Date;
  endTime: Date;
}

/** Both sides use the same half-open AVAILABLE intervals, clipped to room creation and period. */
export function calculateDashboardOccupancy(
  rooms: InventoryRoom[],
  bookings: OccupancyBooking[],
  startDate: Date,
  endDate: Date,
): { bookedMinutes: number; totalPeriodRoomMinutes: number } {
  const intervalsByRoom = new Map<string, Array<{ start: number; end: number }>>();
  let availableMs = 0;
  for (const room of rooms) {
    const intervals = [];
    for (let i = 0; i < room.statusHistory.length; i++) {
      const event = room.statusHistory[i];
      if (event.status !== RoomStatus.AVAILABLE) continue;
      const start = Math.max(
        startDate.getTime(),
        room.createdAt.getTime(),
        event.effectiveAt.getTime(),
      );
      const end = Math.min(
        endDate.getTime(),
        room.statusHistory[i + 1]?.effectiveAt.getTime() ?? endDate.getTime(),
      );
      if (end > start) {
        intervals.push({ start, end });
        availableMs += end - start;
      }
    }
    intervalsByRoom.set(room.id, intervals);
  }

  let bookedMs = 0;
  for (const booking of bookings) {
    if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.COMPLETED)
      continue;
    for (const interval of intervalsByRoom.get(booking.roomId) ?? []) {
      const start = Math.max(interval.start, booking.startTime.getTime());
      const end = Math.min(interval.end, booking.endTime.getTime());
      if (end > start) bookedMs += end - start;
    }
  }

  // Keep fractional minutes: status transitions need not land on minute boundaries.
  return { bookedMinutes: bookedMs / 60000, totalPeriodRoomMinutes: availableMs / 60000 };
}
