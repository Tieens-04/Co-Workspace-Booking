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
}

export interface AdminRoomFormValues {
  name: string;
  description: string;
  capacity: string;
  pricePerHour: string;
  amenityIds: string[];
  images: AdminRoomImageItem[];
}

export interface AdminFormErrors {
  name?: string;
  description?: string;
  capacity?: string;
  pricePerHour?: string;
  amenityIds?: string;
  images?: string;
  general?: string;
}
