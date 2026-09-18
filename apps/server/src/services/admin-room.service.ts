import {
  RoomRepositoryContract,
  roomRepository,
  RoomDetailRecord,
} from '../repositories/room.repository.js';
import { CreateRoomInput, UpdateRoomInput } from '../validators/admin-room.validator.js';
import { RoomDetail } from '../types/room.type.js';
import { formatPrice, mapAmenities, mapImages } from './room.service.js';

function toRoomDetailDto(record: RoomDetailRecord): RoomDetail {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    capacity: record.capacity,
    pricePerHour: formatPrice(record.pricePerHour),
    status: record.status,
    images: mapImages(record.images),
    amenities: mapAmenities(record.amenities),
  };
}

export class AdminRoomService {
  constructor(private readonly roomRepo: RoomRepositoryContract = roomRepository) {}

  async createRoom(data: CreateRoomInput): Promise<RoomDetail> {
    const created = await this.roomRepo.createWithRelations({
      name: data.name,
      description: data.description,
      capacity: data.capacity,
      pricePerHour: data.pricePerHour,
      amenityIds: data.amenityIds,
      images: data.images,
    });
    return toRoomDetailDto(created);
  }

  async updateRoom(id: string, data: UpdateRoomInput): Promise<RoomDetail> {
    const updated = await this.roomRepo.updateWithRelations(id, {
      name: data.name,
      description: data.description,
      capacity: data.capacity,
      pricePerHour: data.pricePerHour,
      amenityIds: data.amenityIds,
      images: data.images,
    });
    return toRoomDetailDto(updated);
  }
}

export const adminRoomService = new AdminRoomService();
