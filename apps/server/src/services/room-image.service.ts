import {
  RoomRepositoryContract,
  roomRepository,
  RoomDetailRecord,
} from '../repositories/room.repository.js';
import {
  MediaStorageServiceContract,
  cloudinaryMediaService,
  UploadedMediaResult,
} from './cloudinary-media.service.js';
import { RoomDetail } from '../types/room.type.js';
import { toRoomDetailDto } from './admin-room.service.js';
import { AppError } from '../utils/error.util.js';
import { MAX_ROOM_IMAGE_FILES, validateImageSignature } from '../utils/image-signature.util.js';

export interface RoomImageServiceContract {
  uploadRoomImages(roomId: string, files: Express.Multer.File[]): Promise<RoomDetail>;
}

export class RoomImageService implements RoomImageServiceContract {
  constructor(
    private readonly roomRepo: RoomRepositoryContract = roomRepository,
    private readonly mediaStorage: MediaStorageServiceContract = cloudinaryMediaService,
  ) {}

  async uploadRoomImages(roomId: string, files: Express.Multer.File[]): Promise<RoomDetail> {
    if (!files || files.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Vui lòng chọn ít nhất một file ảnh để tải lên', 400);
    }

    if (files.length > MAX_ROOM_IMAGE_FILES) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Số lượng file vượt quá giới hạn cho phép (tối đa ${MAX_ROOM_IMAGE_FILES} file)`,
        400,
      );
    }

    // 1. Verify room exists before uploading anything to Cloudinary
    const room = await this.roomRepo.findById(roomId);
    if (!room) {
      throw new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404);
    }

    // 2. Validate magic bytes signature of each file
    for (const file of files) {
      if (!validateImageSignature(file.buffer, file.mimetype)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'File ảnh không hợp lệ hoặc định dạng không khớp với nội dung',
          400,
        );
      }
    }

    // 3. Upload all files to Cloudinary with tracking for rollback/compensation
    const uploadedAssets: UploadedMediaResult[] = [];
    try {
      for (const file of files) {
        const uploaded = await this.mediaStorage.uploadImage(roomId, file.buffer, file.mimetype);
        uploadedAssets.push(uploaded);
      }
    } catch (uploadError) {
      // Partial upload failure: clean up all already-uploaded assets in this batch
      if (uploadedAssets.length > 0) {
        await this.mediaStorage
          .destroyManyImages(uploadedAssets.map((a) => a.publicId))
          .catch((cleanupErr) => {
            console.error(
              'Failed to cleanup partial uploaded assets:',
              cleanupErr?.message || cleanupErr,
            );
          });
      }
      if (uploadError instanceof AppError) {
        throw uploadError;
      }
      throw new AppError('IMAGE_UPLOAD_FAILED', 'Không thể upload ảnh lên dịch vụ lưu trữ', 502);
    }

    // 4. Batch append images to database inside repository transaction
    let updatedRecord: RoomDetailRecord;
    try {
      updatedRecord = await this.roomRepo.appendImages(
        roomId,
        uploadedAssets.map((a) => ({
          imageUrl: a.imageUrl,
          publicId: a.publicId,
        })),
      );
    } catch (dbError) {
      // Database transaction failed: clean up all uploaded assets for this batch
      await this.mediaStorage
        .destroyManyImages(uploadedAssets.map((a) => a.publicId))
        .catch((cleanupErr) => {
          console.error(
            'Failed to cleanup uploaded assets after DB failure:',
            cleanupErr?.message || cleanupErr,
          );
        });
      throw dbError;
    }

    return toRoomDetailDto(updatedRecord);
  }
}

export const roomImageService = new RoomImageService();
