import { v2 as cloudinary } from 'cloudinary';
import { cloudinary as defaultCloudinary } from '../config/cloudinary.config.js';
import { AppError } from '../utils/error.util.js';

export interface UploadedMediaResult {
  imageUrl: string;
  publicId: string;
}

export interface MediaStorageServiceContract {
  uploadImage(roomId: string, buffer: Buffer, mimeType?: string): Promise<UploadedMediaResult>;
  destroyImage(publicId: string): Promise<void>;
  destroyManyImages(publicIds: string[]): Promise<void>;
}

export class CloudinaryMediaService implements MediaStorageServiceContract {
  constructor(private readonly client: typeof cloudinary = defaultCloudinary) {}

  async uploadImage(
    roomId: string,
    buffer: Buffer,
    _mimeType?: string,
  ): Promise<UploadedMediaResult> {
    return new Promise<UploadedMediaResult>((resolve, reject) => {
      const uploadStream = this.client.uploader.upload_stream(
        {
          folder: `co-space/rooms/${roomId}`,
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            return reject(
              new AppError('IMAGE_UPLOAD_FAILED', 'Không thể upload ảnh lên Cloudinary', 502),
            );
          }

          if (
            result.secure_url.length > 500 ||
            (result.public_id && result.public_id.length > 191)
          ) {
            if (result.public_id) {
              this.client.uploader
                .destroy(result.public_id, { resource_type: 'image' })
                .catch(() => {});
            }
            return reject(
              new AppError(
                'IMAGE_UPLOAD_FAILED',
                'Dữ liệu ảnh trả về từ Cloudinary vượt quá giới hạn lưu trữ',
                502,
              ),
            );
          }

          resolve({
            imageUrl: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      uploadStream.end(buffer);
    });
  }

  async destroyImage(publicId: string): Promise<void> {
    if (!publicId) return;
    try {
      await this.client.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (err: any) {
      console.error(
        `Failed to destroy Cloudinary asset (publicId: ${publicId}):`,
        err?.message || err,
      );
    }
  }

  async destroyManyImages(publicIds: string[]): Promise<void> {
    if (!publicIds || publicIds.length === 0) return;
    await Promise.allSettled(publicIds.map((id) => this.destroyImage(id)));
  }
}

export const cloudinaryMediaService = new CloudinaryMediaService();
