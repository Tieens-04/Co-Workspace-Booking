import {
  RoomRepositoryContract,
  roomRepository,
  RoomListRecord,
  SelectedRoomImage,
  SelectedRoomAmenity,
} from '../repositories/room.repository.js';
import {
  FindRoomsFilter,
  GetRoomsResponseData,
  RoomDetail,
  RoomListItem,
  RoomImageDto,
  AmenityDto,
} from '../types/room.type.js';
import { AppError } from '../utils/error.util.js';

function formatPrice(price: unknown): string {
  if (
    price &&
    typeof price === 'object' &&
    'toFixed' in price &&
    typeof (price as { toFixed: (digits: number) => string }).toFixed === 'function'
  ) {
    return (price as { toFixed: (digits: number) => string }).toFixed(2);
  }
  return Number(price).toFixed(2);
}

function resolveCoverImage(images: SelectedRoomImage[]): string | null {
  if (!images || images.length === 0) {
    return null;
  }

  const primaryImages = images.filter((img) => img.isPrimary);
  if (primaryImages.length > 0) {
    primaryImages.sort((a, b) => {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });
    return primaryImages[0].imageUrl;
  }

  const sortedImages = [...images].sort((a, b) => {
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
  return sortedImages[0].imageUrl;
}

function mapAmenities(rawAmenities: SelectedRoomAmenity[]): AmenityDto[] {
  return rawAmenities
    .map((ra) => ({
      id: ra.amenity.id,
      name: ra.amenity.name,
      icon: ra.amenity.icon,
      description: ra.amenity.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapImages(rawImages: SelectedRoomImage[]): RoomImageDto[] {
  const sorted = [...rawImages].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1;
    }
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  return sorted.map((img) => ({
    id: img.id,
    imageUrl: img.imageUrl,
    isPrimary: img.isPrimary,
  }));
}

export class RoomService {
  constructor(private readonly roomRepo: RoomRepositoryContract = roomRepository) {}

  async getRooms(filter: FindRoomsFilter): Promise<GetRoomsResponseData> {
    const [total, rooms] = await this.roomRepo.findManyAndCount(filter);
    const totalPages = total === 0 ? 0 : Math.ceil(total / filter.limit);

    const items: RoomListItem[] = rooms.map((room: RoomListRecord) => ({
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      pricePerHour: formatPrice(room.pricePerHour),
      status: room.status,
      coverImage: resolveCoverImage(room.images),
      amenities: mapAmenities(room.amenities),
    }));

    return {
      items,
      pagination: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages,
      },
    };
  }

  async getRoomById(id: string): Promise<RoomDetail> {
    const room = await this.roomRepo.findById(id);
    if (!room) {
      throw new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404);
    }

    return {
      id: room.id,
      name: room.name,
      description: room.description,
      capacity: room.capacity,
      pricePerHour: formatPrice(room.pricePerHour),
      status: room.status,
      images: mapImages(room.images),
      amenities: mapAmenities(room.amenities),
    };
  }
}

export const roomService = new RoomService();
