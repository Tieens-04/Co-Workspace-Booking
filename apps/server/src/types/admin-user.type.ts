import { Role } from '@prisma/client';

/** CWB-79: derived from `users.locked_at` (null = ACTIVE). */
export const ACCOUNT_STATUSES = ['ACTIVE', 'LOCKED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Admin view of an account. Never carries the password hash or token version. */
export interface AdminUserDto {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: Role;
  status: AccountStatus;
  lockedAt: Date | null;
  lockReason: string | null;
  createdAt: Date;
  /** All bookings of the account, any status. */
  bookingCount: number;
  /** Bookings already recorded as NO_SHOW. */
  noShowCount: number;
  /** CONFIRMED bookings starting at or after now. */
  upcomingBookingCount: number;
  /** Creation time of the most recent booking, or null. */
  lastBookingAt: Date | null;
}

export interface FindAdminUsersFilter {
  page: number;
  limit: number;
  q?: string;
  role?: Role;
  status?: AccountStatus;
}

export interface AdminUserListResponseData {
  items: AdminUserDto[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** Upcoming booking the admin is warned about when locking; it is not cancelled. */
export interface AffectedBookingDto {
  id: string;
  bookingCode: string;
  roomName: string;
  startTime: Date;
  endTime: Date;
}

export interface UpdateUserStatusResult {
  user: AdminUserDto;
  affectedBookings: AffectedBookingDto[];
}
