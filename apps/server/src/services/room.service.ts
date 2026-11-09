import { RoomStatus } from '@prisma/client';
import {
  RoomRepositoryContract,
  roomRepository,
  RoomListRecord,
  RoomDetailRecord,
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
  RoomAvailabilityResponseData,
} from '../types/room.type.js';
import { AppError } from '../utils/error.util.js';
import { getDayBounds, generateAvailabilitySlots } from '../utils/room-availability.util.js';
import { ENV } from '../config/env.config.js';
import {
  bookingHorizonError,
  getBookingHorizonEnd,
  validateBookingTime,
} from '../utils/booking-time.util.js';
import { BUSINESS_TIMEZONE } from '../utils/booking-code.util.js';

export function formatPrice(price: unknown): string {
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

export function mapAmenities(rawAmenities: SelectedRoomAmenity[]): AmenityDto[] {
  return rawAmenities
    .map((ra) => ({
      id: ra.amenity.id,
      name: ra.amenity.name,
      icon: ra.amenity.icon,
      description: ra.amenity.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function mapImages(rawImages: SelectedRoomImage[]): RoomImageDto[] {
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

export function toRoomDetailDto(room: RoomDetailRecord): RoomDetail {
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

export class RoomService {
  constructor(private readonly roomRepo: RoomRepositoryContract = roomRepository) {}

  async getRooms(filter: FindRoomsFilter): Promise<GetRoomsResponseData> {
    if (Boolean(filter.startDate) !== Boolean(filter.endDate)) {
      throw new AppError('VALIDATION_ERROR', 'startDate và endDate phải đi cùng nhau', 400);
    }
    if (filter.startDate && filter.endDate) {
      validateBookingTime(filter.startDate, filter.endDate);
    }
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

  mapToRoomDetail(room: RoomDetailRecord): RoomDetail {
    return toRoomDetailDto(room);
  }

  async getRoomById(id: string): Promise<RoomDetail> {
    const room = await this.roomRepo.findById(id);
    if (!room || room.status === RoomStatus.ARCHIVED) {
      throw new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404);
    }

    return toRoomDetailDto(room);
  }

  async getAvailability(
    id: string,
    date: string,
    now = new Date(),
  ): Promise<RoomAvailabilityResponseData> {
    const { dayStart, dayEnd } = getDayBounds(date);

    // CWB-75: a day whose first slot already starts after the horizon has nothing bookable.
    const bookableUntil = getBookingHorizonEnd(now);
    if (dayStart.getTime() > bookableUntil.getTime()) {
      throw bookingHorizonError();
    }

    const room = await this.roomRepo.findAvailabilityById(id, dayStart, dayEnd);
    if (!room || room.status === RoomStatus.ARCHIVED) {
      throw new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404);
    }

    if (room.status === RoomStatus.MAINTENANCE) {
      throw new AppError(
        'ROOM_NOT_AVAILABLE',
        'Phòng đang trong trạng thái bảo trì, không thể kiểm tra lịch trống',
        409,
      );
    }

    const slots = generateAvailabilitySlots(dayStart, dayEnd, room.bookings);

    return {
      roomId: room.id,
      date,
      timezone: BUSINESS_TIMEZONE,
      slots,
      maxAdvanceDays: ENV.BOOKING_MAX_ADVANCE_DAYS,
      bookableUntil: bookableUntil.toISOString(),
    };
  }
}

export const roomService = new RoomService();
