export interface ClosureRoom {
  id: string;
  name: string;
}

export interface ClosureCreator {
  id: string;
  fullName: string;
  email: string;
}

export interface ClosureItem {
  id: string;
  roomId: string | null;
  room?: ClosureRoom | null;
  startTime: string;
  endTime: string;
  reason: string;
  createdById: string;
  createdBy?: ClosureCreator | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClosurePayload {
  roomId?: string | null;
  startTime: string;
  endTime: string;
  reason: string;
  acknowledgeConflictingBookings?: boolean;
}

export interface UpdateClosurePayload {
  roomId?: string | null;
  startTime?: string;
  endTime?: string;
  reason?: string;
  acknowledgeConflictingBookings?: boolean;
}

export interface ConflictingBooking {
  bookingCode: string;
  roomId: string;
  roomName?: string;
  startTime: string;
  endTime: string;
  guestName?: string | null;
  userEmail?: string | null;
}

export interface ClosureFilterQuery {
  page?: number;
  limit?: number;
  roomId?: string;
  from?: string;
  to?: string;
  upcoming?: boolean;
}
