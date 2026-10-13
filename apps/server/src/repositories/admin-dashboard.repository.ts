import { Prisma, BookingStatus, PaymentStatus, RoomStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { bookingRepository } from './booking.repository.js';
import {
  getDayBounds,
  generateAvailabilitySlots,
  BookingInterval,
} from '../utils/room-availability.util.js';
import {
  DashboardRoomScheduleDto,
  DashboardScheduleResponseDto,
} from '../types/admin-dashboard.type.js';

export interface DashboardKpiRawResult {
  totalAvailableRooms: number;
  totalRooms: number;
  todayBookingsCount: number;
  periodBookingsCount: number;
  bookedMinutes: number;
  totalPeriodRoomMinutes: number;
  actualRevenue: string;
  potentialRevenue: string;
  unpaidRevenue: string;
  statusBreakdown: {
    confirmed: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  paidBookingsCount: number;
  unpaidBookingsCount: number;
}

export interface AdminDashboardRepositoryContract {
  evaluateNoShowBookings(now?: Date): Promise<number>;
  getKpiData(bounds: {
    startDate: Date;
    endDate: Date;
    todayStart: Date;
    todayEnd: Date;
  }): Promise<DashboardKpiRawResult>;
  getScheduleData(dateStr: string): Promise<DashboardScheduleResponseDto>;
}

export class AdminDashboardRepository implements AdminDashboardRepositoryContract {
  async evaluateNoShowBookings(now: Date = new Date()): Promise<number> {
    return bookingRepository.evaluateNoShowBookings(now);
  }

  async getKpiData(bounds: {
    startDate: Date;
    endDate: Date;
    todayStart: Date;
    todayEnd: Date;
  }): Promise<DashboardKpiRawResult> {
    const { startDate, endDate, todayStart, todayEnd } = bounds;

    // 1. Count rooms
    const [totalRooms, totalAvailableRooms] = await Promise.all([
      prisma.room.count(),
      prisma.room.count({ where: { status: RoomStatus.AVAILABLE } }),
    ]);

    // 2. Count today bookings
    const todayBookingsCount = await prisma.booking.count({
      where: {
        startTime: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
    });

    // 3. Query bookings in period [startDate, endDate)
    const periodBookings = await prisma.booking.findMany({
      where: {
        startTime: {
          lt: endDate,
        },
        endTime: {
          gt: startDate,
        },
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        startTime: true,
        endTime: true,
      },
    });

    let actualRevenueDecimal = new Prisma.Decimal(0);
    let potentialRevenueDecimal = new Prisma.Decimal(0);
    let paidBookingsCount = 0;
    let unpaidBookingsCount = 0;

    const statusBreakdown = {
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
    };

    let bookedMinutes = 0;

    for (const b of periodBookings) {
      // Status breakdown
      if (b.status === BookingStatus.CONFIRMED) statusBreakdown.confirmed += 1;
      else if (b.status === BookingStatus.COMPLETED) statusBreakdown.completed += 1;
      else if (b.status === BookingStatus.CANCELLED) statusBreakdown.cancelled += 1;
      else if (b.status === BookingStatus.NO_SHOW) statusBreakdown.noShow += 1;

      if (b.status === BookingStatus.CANCELLED) {
        continue;
      }

      // Overlap minutes in period: only active confirmed/completed bookings occupy rooms
      if (b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.COMPLETED) {
        const overlapStartMs = Math.max(b.startTime.getTime(), startDate.getTime());
        const overlapEndMs = Math.min(b.endTime.getTime(), endDate.getTime());
        if (overlapEndMs > overlapStartMs) {
          bookedMinutes += Math.round((overlapEndMs - overlapStartMs) / (60 * 1000));
        }
      }

      // Revenue
      const amount = new Prisma.Decimal(b.totalAmount);
      potentialRevenueDecimal = potentialRevenueDecimal.add(amount);

      if (b.paymentStatus === PaymentStatus.PAID) {
        actualRevenueDecimal = actualRevenueDecimal.add(amount);
        paidBookingsCount += 1;
      } else {
        unpaidBookingsCount += 1;
      }
    }

    const unpaidRevenueDecimal = potentialRevenueDecimal.sub(actualRevenueDecimal);

    const periodDurationMinutes = Math.round(
      (endDate.getTime() - startDate.getTime()) / (60 * 1000),
    );
    const totalPeriodRoomMinutes = totalAvailableRooms * periodDurationMinutes;

    return {
      totalAvailableRooms,
      totalRooms,
      todayBookingsCount,
      periodBookingsCount: periodBookings.length,
      bookedMinutes,
      totalPeriodRoomMinutes,
      actualRevenue: actualRevenueDecimal.toFixed(2),
      potentialRevenue: potentialRevenueDecimal.toFixed(2),
      unpaidRevenue: unpaidRevenueDecimal.toFixed(2),
      statusBreakdown,
      paidBookingsCount,
      unpaidBookingsCount,
    };
  }

  async getScheduleData(dateStr: string): Promise<DashboardScheduleResponseDto> {
    const { dayStart, dayEnd } = getDayBounds(dateStr);

    const rooms = await prisma.room.findMany({
      select: {
        id: true,
        name: true,
        capacity: true,
        pricePerHour: true,
        status: true,
        bookings: {
          where: {
            status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
            startTime: { lt: dayEnd },
            endTime: { gt: dayStart },
          },
          select: {
            id: true,
            bookingCode: true,
            startTime: true,
            endTime: true,
            status: true,
            guestName: true,
            user: {
              select: {
                fullName: true,
              },
            },
          },
          orderBy: {
            startTime: 'asc',
          },
        },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    const roomDtos: DashboardRoomScheduleDto[] = rooms.map((room) => {
      const isMaintenance = room.status === RoomStatus.MAINTENANCE;

      const blockingIntervals: BookingInterval[] = room.bookings.map((b) => ({
        startTime: b.startTime,
        endTime: b.endTime,
      }));

      const rawSlots = isMaintenance
        ? []
        : generateAvailabilitySlots(dayStart, dayEnd, blockingIntervals);

      const slots = rawSlots.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
      }));

      const bookings = room.bookings.map((b) => ({
        id: b.id,
        bookingCode: b.bookingCode,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        customerName: b.user?.fullName || b.guestName || 'Khách vãng lai',
      }));

      return {
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        pricePerHour: room.pricePerHour.toString(),
        status: room.status,
        slots,
        bookings,
      };
    });

    return {
      date: dateStr,
      rooms: roomDtos,
    };
  }
}

export const adminDashboardRepository = new AdminDashboardRepository();
