import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryMediaService } from '../services/cloudinary-media.service.js';

describe('CloudinaryMediaService Unit Tests', () => {
  let mockUploadStream: any;
  let mockDestroy: any;
  let mockClient: typeof cloudinary;
  let service: CloudinaryMediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadStream = vi.fn();
    mockDestroy = vi.fn().mockResolvedValue({ result: 'ok' });
    mockClient = {
      uploader: {
        upload_stream: mockUploadStream,
        destroy: mockDestroy,
      },
    } as unknown as typeof cloudinary;
    service = new CloudinaryMediaService(mockClient);
  });

  describe('uploadImage', () => {
    it('successfully uploads image buffer and returns secure_url and public_id', async () => {
      const dummyBuffer = Buffer.from('image-data');
      const expectedResult = {
        secure_url:
          'https://res.cloudinary.com/test/image/upload/v123/co-space/rooms/room-1/photo.jpg',
        public_id: 'co-space/rooms/room-1/photo',
      };

      mockUploadStream.mockImplementation((options: any, callback: any) => {
        return {
          end: (buf: Buffer) => {
            expect(buf).toEqual(dummyBuffer);
            callback(null, expectedResult);
          },
        };
      });

      const result = await service.uploadImage('room-1', dummyBuffer);

      expect(mockUploadStream).toHaveBeenCalledWith(
        {
          folder: 'co-space/rooms/room-1',
          resource_type: 'image',
        },
        expect.any(Function),
      );
      expect(result).toEqual({
        imageUrl: expectedResult.secure_url,
        publicId: expectedResult.public_id,
      });
    });

    it('rejects with 502 IMAGE_UPLOAD_FAILED when upload_stream returns error', async () => {
      mockUploadStream.mockImplementation((_options: any, callback: any) => {
        return {
          end: () => {
            callback(new Error('Cloudinary stream connection error'), null);
          },
        };
      });

      await expect(service.uploadImage('room-1', Buffer.from('data'))).rejects.toThrow(
        expect.objectContaining({
          code: 'IMAGE_UPLOAD_FAILED',
          statusCode: 502,
        }),
      );
    });

    it('rejects with 502 IMAGE_UPLOAD_FAILED when upload_stream returns null result', async () => {
      mockUploadStream.mockImplementation((_options: any, callback: any) => {
        return {
          end: () => {
            callback(null, null);
          },
        };
      });

      await expect(service.uploadImage('room-1', Buffer.from('data'))).rejects.toThrow(
        expect.objectContaining({
          code: 'IMAGE_UPLOAD_FAILED',
          statusCode: 502,
        }),
      );
    });

    it('destroys asset and rejects when secure_url exceeds 500 characters', async () => {
      const longUrl = 'https://res.cloudinary.com/' + 'a'.repeat(501);
      mockUploadStream.mockImplementation((_options: any, callback: any) => {
        return {
          end: () => {
            callback(null, {
              secure_url: longUrl,
              public_id: 'co-space/rooms/room-1/too_long_url',
            });
          },
        };
      });

      await expect(service.uploadImage('room-1', Buffer.from('data'))).rejects.toThrow(
        expect.objectContaining({
          code: 'IMAGE_UPLOAD_FAILED',
          message: expect.stringContaining('vượt quá giới hạn lưu trữ'),
          statusCode: 502,
        }),
      );

      expect(mockDestroy).toHaveBeenCalledWith('co-space/rooms/room-1/too_long_url', {
        resource_type: 'image',
      });
    });

    it('destroys asset and rejects when public_id exceeds 191 characters', async () => {
      const longPublicId = 'co-space/rooms/' + 'x'.repeat(195);
      mockUploadStream.mockImplementation((_options: any, callback: any) => {
        return {
          end: () => {
            callback(null, {
              secure_url: 'https://res.cloudinary.com/valid.jpg',
              public_id: longPublicId,
            });
          },
        };
      });

      await expect(service.uploadImage('room-1', Buffer.from('data'))).rejects.toThrow(
        expect.objectContaining({
          code: 'IMAGE_UPLOAD_FAILED',
          statusCode: 502,
        }),
      );

      expect(mockDestroy).toHaveBeenCalledWith(longPublicId, {
        resource_type: 'image',
      });
    });
  });

  describe('destroyImage', () => {
    it('does nothing if publicId is empty', async () => {
      await service.destroyImage('');
      expect(mockDestroy).not.toHaveBeenCalled();
    });

    it('calls uploader.destroy with resource_type image', async () => {
      await service.destroyImage('co-space/rooms/room-1/photo_123');
      expect(mockDestroy).toHaveBeenCalledWith('co-space/rooms/room-1/photo_123', {
        resource_type: 'image',
      });
    });

    it('catches and logs error without rethrowing when destroy fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockDestroy.mockRejectedValueOnce(new Error('Cloudinary API rate limit'));

      await expect(
        service.destroyImage('co-space/rooms/room-1/photo_123'),
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to destroy Cloudinary asset'),
        'Cloudinary API rate limit',
      );
      consoleSpy.mockRestore();
    });
  });

  describe('destroyManyImages', () => {
    it('does nothing if publicIds array is empty', async () => {
      await service.destroyManyImages([]);
      expect(mockDestroy).not.toHaveBeenCalled();
    });

    it('destroys all publicIds in parallel settled', async () => {
      const ids = ['id_1', 'id_2', 'id_3'];
      await service.destroyManyImages(ids);

      expect(mockDestroy).toHaveBeenCalledTimes(3);
      expect(mockDestroy).toHaveBeenCalledWith('id_1', { resource_type: 'image' });
      expect(mockDestroy).toHaveBeenCalledWith('id_2', { resource_type: 'image' });
      expect(mockDestroy).toHaveBeenCalledWith('id_3', { resource_type: 'image' });
    });
  });
});
