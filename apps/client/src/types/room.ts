export type RoomStatus = 'AVAILABLE' | 'MAINTENANCE' | 'ARCHIVED';
export type RoomSlotStatus = 'AVAILABLE' | 'BOOKED';

export type RoomSortOption =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'capacity_asc'
  | 'capacity_desc';

export interface RoomAvailabilitySlot {
  startTime: string;
  endTime: string;
  status: RoomSlotStatus;
}

export interface RoomAvailabilityResponseData {
  roomId: string;
  date: string;
  timezone: string;
  slots: RoomAvailabilitySlot[];
  /** CWB-75: server booking horizon; bookings may start at most this many days ahead. */
  maxAdvanceDays?: number;
  bookableUntil?: string;
}

export interface Amenity {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
}

export interface RoomImage {
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
  amenities: Amenity[];
}

export interface RoomDetail {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  pricePerHour: string;
  status: RoomStatus;
  images: RoomImage[];
  amenities: Amenity[];
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

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface RoomFilters {
  capacity?: number;
  minPrice?: string;
  maxPrice?: string;
  amenityIds?: string[];
  q?: string;
  sort?: RoomSortOption;
  date?: string;
  startTime?: string;
  endTime?: string;
}

export interface GetRoomsParams {
  page?: number;
  limit?: number;
  capacity?: number;
  minPrice?: string;
  maxPrice?: string;
  amenityIds?: string;
  q?: string;
  sort?: RoomSortOption;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: RoomStatus;
}
