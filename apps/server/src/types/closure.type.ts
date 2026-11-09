export interface ClosureRoomDto {
  id: string;
  name: string;
}

export interface ClosureCreatorDto {
  id: string;
  fullName: string;
  email: string;
}

export interface ClosureDto {
  id: string;
  roomId: string | null;
  room?: ClosureRoomDto | null;
  startTime: string;
  endTime: string;
  reason: string;
  createdById: string;
  createdBy?: ClosureCreatorDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClosureFilterParams {
  page: number;
  limit: number;
  roomId?: string;
  from?: Date;
  to?: Date;
  upcoming?: boolean;
}

export interface CreateClosureInput {
  roomId?: string | null;
  startTime: string;
  endTime: string;
  reason: string;
  acknowledgeConflictingBookings?: boolean;
}

export interface UpdateClosureInput {
  roomId?: string | null;
  startTime?: string;
  endTime?: string;
  reason?: string;
  acknowledgeConflictingBookings?: boolean;
}
