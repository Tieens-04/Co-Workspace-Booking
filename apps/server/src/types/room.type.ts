import { RoomStatus } from '@prisma/client';

export interface AmenityDto {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
}

export interface RoomImageDto {
  id: string;
  imageUrl: string;
  isPrimary: boolean;
}

export interface RoomListItem {
  id: string;
  name: string;
  capacity: number;
  pricePerHour: string;
  status: RoomStatus;
  coverImage: string | null;
  amenities: AmenityDto[];
}

export interface RoomDetail {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  pricePerHour: string;
  status: RoomStatus;
  images: RoomImageDto[];
  amenities: AmenityDto[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface GetRoomsResponseData {
  items: RoomListItem[];
  pagination: PaginationMeta;
}

export interface FindRoomsFilter {
  page: number;
  limit: number;
  capacity?: number;
  minPrice?: string;
  maxPrice?: string;
  amenityIds?: string[];
}

export type RoomSlotStatus = 'AVAILABLE' | 'BOOKED';

export interface RoomAvailabilitySlotDto {
  startTime: string;
  endTime: string;
  status: RoomSlotStatus;
}

export interface RoomAvailabilityResponseData {
  roomId: string;
  date: string;
  timezone: string;
  slots: RoomAvailabilitySlotDto[];
}
