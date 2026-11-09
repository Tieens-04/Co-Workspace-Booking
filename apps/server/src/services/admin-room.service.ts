import type { AuditActor } from '../repositories/audit.repository.js';
import {
  RoomRepositoryContract,
  roomRepository,
} from '../repositories/room.repository.js';
import { MediaStorageServiceContract, cloudinaryMediaService } from './cloudinary-media.service.js';
import { CreateRoomInput, UpdateRoomInput } from '../validators/admin-room.validator.js';
import { RoomDetail } from '../types/room.type.js';
import { AppError } from '../utils/error.util.js';
import { toRoomDetailDto } from './room.service.js';

export { toRoomDetailDto };

export class AdminRoomService {
  constructor(
    private readonly roomRepo: RoomRepositoryContract = roomRepository,
    private readonly mediaStorage: MediaStorageServiceContract = cloudinaryMediaService,
  ) {}

  async getRoomById(id: string): Promise<RoomDetail> {
    const room = await this.roomRepo.findById(id);
    if (!room) {
      throw new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404);
    }
    return toRoomDetailDto(room);
  }

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

  async updateRoom(id: string, data: UpdateRoomInput, actor?: AuditActor): Promise<RoomDetail> {
    const { record, removedPublicIds } = await this.roomRepo.updateWithRelations(id, {
      name: data.name,
      description: data.description,
      capacity: data.capacity,
      pricePerHour: data.pricePerHour,
      amenityIds: data.amenityIds,
      images: data.images,
      status: data.status,
      acknowledgeFutureBookings: data.acknowledgeFutureBookings,
      ...(actor ? { auditActor: actor } : {}),
    });

    if (removedPublicIds && removedPublicIds.length > 0) {
      this.mediaStorage.destroyManyImages(removedPublicIds).catch((err) => {
        console.error('Failed to cleanup removed room images:', err?.message || err);
      });
    }

    return toRoomDetailDto(record);
  }
}

export const adminRoomService = new AdminRoomService();
