import { RoomSlotStatus } from './room';

export type DashboardPeriodType = 'day' | 'week';

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

export interface DashboardKpiData {
  period: DashboardKpiPeriodInfo;
  todayBookingsCount: number;
  periodBookingsCount: number;
  occupancyRate: number;
  totalRoomMinutes: number;
  bookedMinutes: number;
  actualRevenue: string;
  potentialRevenue: string;
  unpaidRevenue: string;
  statusBreakdown: DashboardStatusBreakdown;
  paidBookingsCount: number;
  unpaidBookingsCount: number;
}

export interface DashboardScheduleSlot {
  startTime: string;
  endTime: string;
  status: RoomSlotStatus;
}

export interface DashboardScheduleBooking {
  id: string;
  bookingCode: string;
  startTime: string;
  endTime: string;
  status: string;
  customerName: string;
}

export interface DashboardRoomSchedule {
  id: string;
  name: string;
  capacity: number;
  pricePerHour: string;
  status: 'AVAILABLE' | 'MAINTENANCE';
  slots: DashboardScheduleSlot[];
  bookings: DashboardScheduleBooking[];
}

export interface DashboardScheduleData {
  date: string;
  rooms: DashboardRoomSchedule[];
  /** Counts over all rooms, independent of the page (CWB-57). */
  summary: { totalRooms: number; availableRooms: number; maintenanceRooms: number };
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
