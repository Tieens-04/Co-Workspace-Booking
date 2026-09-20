import { RoomStatus } from './room';

export interface AdminRoomImageItem {
  imageUrl: string;
  isPrimary: boolean;
}

export interface CreateRoomPayload {
  name: string;
  description?: string | null;
  capacity: number;
  pricePerHour: string | number;
  amenityIds?: string[];
  images?: AdminRoomImageItem[];
}

export interface UpdateRoomPayload {
  name?: string;
  description?: string | null;
  capacity?: number;
  pricePerHour?: string | number;
  amenityIds?: string[];
  images?: AdminRoomImageItem[];
  status?: RoomStatus;
  acknowledgeFutureBookings?: boolean;
}

export interface FutureBookingWarningItem {
  bookingCode: string;
  startTime: string;
  endTime: string;
}

export interface FutureBookingWarningDetails {
  futureBookingCount: number;
  bookings: FutureBookingWarningItem[];
}

export interface AdminRoomFormValues {
  name: string;
  description: string;
  capacity: string;
  pricePerHour: string;
  amenityIds: string[];
  images: AdminRoomImageItem[];
  status: RoomStatus;
}

export interface AdminFormErrors {
  name?: string;
  description?: string;
  capacity?: string;
  pricePerHour?: string;
  amenityIds?: string;
  images?: string;
  imageUpload?: string;
  general?: string;
}

export const MAX_ROOM_IMAGE_FILES = 10;
export const MAX_ROOM_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
