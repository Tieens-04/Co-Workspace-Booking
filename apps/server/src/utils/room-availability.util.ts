import { RoomAvailabilitySlotDto, RoomSlotStatus } from '../types/room.type.js';

export const SLOT_DURATION_MINUTES = 30;
export const SLOTS_PER_DAY = 48;
export const SLOT_DURATION_MS = SLOT_DURATION_MINUTES * 60 * 1000;

export interface BookingInterval {
  startTime: Date;
  endTime: Date;
}

/**
 * Returns UTC Date objects for start of day and end of day in Vietnam timezone (+07:00).
 * dayStart = YYYY-MM-DDT00:00:00.000+07:00
 * dayEnd   = dayStart + 24 hours
 */
export function getDayBounds(dateStr: string): { dayStart: Date; dayEnd: Date } {
  // Explicit offset +07:00 ensures environment/process timezone independence
  const dayStart = new Date(`${dateStr}T00:00:00.000+07:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

/**
 * Checks if two time intervals strictly overlap.
 * Formula: existing.startTime < slot.endTime AND existing.endTime > slot.startTime
 * Boundary touching is NOT an overlap.
 */
export function isIntervalOverlapping(
  slotStart: Date,
  slotEnd: Date,
  bookingStart: Date,
  bookingEnd: Date,
): boolean {
  return bookingStart.getTime() < slotEnd.getTime() && bookingEnd.getTime() > slotStart.getTime();
}

/**
 * Generates 48 contiguous 30-minute slots covering [dayStart, dayEnd)
 * and determines status (AVAILABLE / BOOKED) based on blocking intervals.
 */
export function generateAvailabilitySlots(
  dayStart: Date,
  dayEnd: Date,
  blockingIntervals: BookingInterval[],
): RoomAvailabilitySlotDto[] {
  const slots: RoomAvailabilitySlotDto[] = [];

  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    const slotStart = new Date(dayStart.getTime() + i * SLOT_DURATION_MS);
    const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MS);

    const isBooked = blockingIntervals.some((b) =>
      isIntervalOverlapping(slotStart, slotEnd, b.startTime, b.endTime),
    );

    const status: RoomSlotStatus = isBooked ? 'BOOKED' : 'AVAILABLE';

    slots.push({
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString(),
      status,
    });
  }

  return slots;
}
