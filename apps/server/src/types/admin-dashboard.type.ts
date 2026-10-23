import { BookingStatus, RoomStatus } from '@prisma/client';

export type DashboardPeriodType = 'day' | 'week';

export interface DashboardKpiFilter {
  date?: string;
  period?: DashboardPeriodType;
}

export interface DashboardKpiPeriodInfo {
  type: DashboardPeriodType;
  date: string;
  startDate: string;
  endDate: string;
}

export interface DashboardStatusBreakdown {
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

export interface DashboardKpiResponseDto {
  period: DashboardKpiPeriodInfo;
  todayBookingsCount: number;
  periodBookingsCount: number;
  occupancyRate: number;
  /** AVAILABLE room-time within the period since creation; fractional minutes are preserved. */
  totalRoomMinutes: number;
  /** CONFIRMED/COMPLETED minutes intersecting the same AVAILABLE room-time. */
  bookedMinutes: number;
  actualRevenue: string;
  potentialRevenue: string;
  unpaidRevenue: string;
  statusBreakdown: DashboardStatusBreakdown;
  paidBookingsCount: number;
  unpaidBookingsCount: number;
}

export interface DashboardScheduleSlotDto {
  startTime: string;
  endTime: string;
  status: 'AVAILABLE' | 'BOOKED';
}

export interface DashboardScheduleBookingDto {
  id: string;
  bookingCode: string;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
  customerName: string;
}

export interface DashboardRoomScheduleDto {
  id: string;
  name: string;
  capacity: number;
  pricePerHour: string;
  status: RoomStatus;
  slots: DashboardScheduleSlotDto[];
  bookings: DashboardScheduleBookingDto[];
}

export interface DashboardScheduleResponseDto {
  date: string;
  rooms: DashboardRoomScheduleDto[];
}

export interface DashboardScheduleFilter {
  date?: string;
}
