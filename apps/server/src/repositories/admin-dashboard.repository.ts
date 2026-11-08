import { BookingStatus, Prisma, RoomStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { summarizeRevenueGroups, toRevenueGroups } from '../utils/booking-revenue.util.js';
import { bookingRepository, NoShowScope } from './booking.repository.js';
import { calculateDashboardOccupancy } from '../utils/dashboard-occupancy.util.js';
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
  evaluateNoShowBookings(now?: Date, scope?: NoShowScope): Promise<number>;
  getKpiData(bounds: {
    startDate: Date;
    endDate: Date;
    todayStart: Date;
    todayEnd: Date;
  }): Promise<DashboardKpiRawResult>;
  getScheduleData(
    dateStr: string,
    page?: number,
    limit?: number,
  ): Promise<DashboardScheduleResponseDto>;
}

export class AdminDashboardRepository implements AdminDashboardRepositoryContract {
  async evaluateNoShowBookings(now: Date = new Date(), scope?: NoShowScope): Promise<number> {
    return bookingRepository.evaluateNoShowBookings(now, undefined, undefined, scope);
  }

  async getKpiData(bounds: {
    startDate: Date;
    endDate: Date;
    todayStart: Date;
    todayEnd: Date;
  }): Promise<DashboardKpiRawResult> {
    const { startDate, endDate, todayStart, todayEnd } = bounds;

    // One repeatable-read snapshot keeps bookings and inventory consistent during room updates.
    return prisma.$transaction(
      async (tx) => {
        // 1. Count rooms
        const [totalRooms, totalAvailableRooms] = await Promise.all([
          tx.room.count(),
          tx.room.count({ where: { status: RoomStatus.AVAILABLE } }),
        ]);

        // 2. Count today bookings
        const todayBookingsCount = await tx.booking.count({
          where: {
            startTime: {
              gte: todayStart,
              lt: todayEnd,
            },
          },
        });

        // 3. Bookings overlapping [startDate, endDate): money and status counts are aggregated
        // in MySQL; only room-occupying intervals are loaded for the occupancy calculation.
        const periodWhere: Prisma.BookingWhereInput = {
          startTime: { lt: endDate },
          endTime: { gt: startDate },
        };
        const groupRows = await tx.booking.groupBy({
          by: ['status', 'paymentStatus'],
          where: periodWhere,
          _count: { _all: true },
          _sum: { totalAmount: true, refundedAmount: true },
        });
        const groups = toRevenueGroups(groupRows);
        const revenue = summarizeRevenueGroups(groups);

        const countByStatus = (status: BookingStatus) =>
          groups.filter((g) => g.status === status).reduce((sum, g) => sum + g.count, 0);
        const statusBreakdown = {
          confirmed: countByStatus(BookingStatus.CONFIRMED),
          completed: countByStatus(BookingStatus.COMPLETED),
          cancelled: countByStatus(BookingStatus.CANCELLED),
          noShow: countByStatus(BookingStatus.NO_SHOW),
        };
        const periodBookingsCount = groups.reduce((sum, g) => sum + g.count, 0);

        const occupyingBookings = await tx.booking.findMany({
          where: {
            ...periodWhere,
            status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
          },
          select: { roomId: true, status: true, startTime: true, endTime: true },
        });

        const rooms = await tx.room.findMany({
          where: { createdAt: { lt: endDate } },
          select: {
            id: true,
            createdAt: true,
            statusHistory: {
              where: { effectiveAt: { lt: endDate } },
              select: { status: true, effectiveAt: true },
              orderBy: { effectiveAt: 'asc' },
            },
          },
        });
        const { bookedMinutes, totalPeriodRoomMinutes } = calculateDashboardOccupancy(
          rooms,
          occupyingBookings,
          startDate,
          endDate,
        );

        return {
          totalAvailableRooms,
          totalRooms,
          todayBookingsCount,
          periodBookingsCount,
          bookedMinutes,
          totalPeriodRoomMinutes,
          actualRevenue: revenue.actualRevenue,
          potentialRevenue: revenue.potentialRevenue,
          unpaidRevenue: revenue.unpaidRevenue,
          statusBreakdown,
          paidBookingsCount: revenue.paidBookings,
          unpaidBookingsCount: revenue.unpaidBookings,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async getScheduleData(
    dateStr: string,
    page = 1,
    limit = 20,
  ): Promise<DashboardScheduleResponseDto> {
    const { dayStart, dayEnd } = getDayBounds(dateStr);

    // Whole-catalog counts for the KPI card; the room list itself is paginated.
    const statusCounts = await prisma.room.groupBy({ by: ['status'], _count: { _all: true } });
    const countOf = (status: RoomStatus) =>
      statusCounts.find((row) => row.status === status)?._count._all ?? 0;
    const total = statusCounts.reduce((sum, row) => sum + row._count._all, 0);
    const rooms = await prisma.room.findMany({
      skip: (page - 1) * limit,
      take: limit,
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
      // id breaks name ties so pages never overlap or skip a room.
      orderBy: [{ status: 'asc' }, { name: 'asc' }, { id: 'asc' }],
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
      summary: {
        totalRooms: total,
        availableRooms: countOf(RoomStatus.AVAILABLE),
        maintenanceRooms: countOf(RoomStatus.MAINTENANCE),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }
}

export const adminDashboardRepository = new AdminDashboardRepository();
