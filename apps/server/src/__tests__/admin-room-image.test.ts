import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { roomRepository, RoomDetailRecord } from '../repositories/room.repository.js';
import { cloudinaryMediaService } from '../services/cloudinary-media.service.js';
import { RoomImageService } from '../services/room-image.service.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({
  default: { $transaction: vi.fn() },
  prisma: { $transaction: vi.fn() },
}));

const validUuid1 = '11111111-1111-4111-8111-111111111111';
const roomId1 = '33333333-3333-4333-8333-333333333333';

const adminToken = generateToken({ sub: 'admin-uuid-1', role: Role.ADMIN });
const customerToken = generateToken({ sub: 'customer-uuid-1', role: Role.CUSTOMER });

const validJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const mockRoomFixture = (override?: Partial<RoomDetailRecord>): RoomDetailRecord => ({
  id: roomId1,
  name: 'Executive Boardroom',
  description: 'Spacious room with modern amenities',
  capacity: 12,
  pricePerHour: new Prisma.Decimal('350.00'),
  status: RoomStatus.AVAILABLE,
  images: [
    {
      id: 'img-1',
      imageUrl: 'https://images.example.com/cover.jpg',
      isPrimary: true,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    },
  ],
  amenities: [
    {
      amenity: {
        id: validUuid1,
        name: 'Wi-Fi 6',
        icon: 'wifi',
        description: 'Super fast internet',
      },
    },
  ],
  ...override,
});

describe('Room Image Upload - Service & HTTP API', () => {
  beforeEach(() => {
    vi.spyOn(roomRepository, 'findById').mockResolvedValue(mockRoomFixture());
    vi.spyOn(roomRepository, 'appendImages').mockResolvedValue(
      mockRoomFixture({
        images: [
          {
            id: 'img-1',
            imageUrl: 'https://images.example.com/cover.jpg',
            isPrimary: true,
            createdAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: 'img-2',
            imageUrl:
              'https://res.cloudinary.com/cospace/image/upload/v1/co-space/rooms/room-1/uploaded-1.jpg',
            isPrimary: false,
            createdAt: new Date('2026-01-01T10:05:00Z'),
          },
        ],
      }),
    );
    vi.spyOn(cloudinaryMediaService, 'uploadImage').mockResolvedValue({
      imageUrl:
        'https://res.cloudinary.com/cospace/image/upload/v1/co-space/rooms/room-1/img-file.jpg',
      publicId: 'secret-public-id-998877',
    });
    vi.spyOn(cloudinaryMediaService, 'destroyManyImages').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('RoomImageService Unit Tests', () => {
    it('throws VALIDATION_ERROR when files array is empty', async () => {
      const service = new RoomImageService(roomRepository, cloudinaryMediaService);
      await expect(service.uploadRoomImages(roomId1, [])).rejects.toThrow(
        'Vui lòng chọn ít nhất một file ảnh',
      );
    });

    it('throws VALIDATION_ERROR when files count exceeds maximum limit', async () => {
      const service = new RoomImageService(roomRepository, cloudinaryMediaService);
      const elevenFiles = Array(11).fill({
        buffer: validJpegBuffer,
        mimetype: 'image/jpeg',
      } as Express.Multer.File);

      await expect(service.uploadRoomImages(roomId1, elevenFiles)).rejects.toThrow(
        'Số lượng file vượt quá giới hạn',
      );
    });

    it('throws ROOM_NOT_FOUND when room does not exist and does not upload to Cloudinary', async () => {
      vi.mocked(roomRepository.findById).mockResolvedValueOnce(null);
      const service = new RoomImageService(roomRepository, cloudinaryMediaService);

      await expect(
        service.uploadRoomImages(roomId1, [
          { buffer: validJpegBuffer, mimetype: 'image/jpeg' } as Express.Multer.File,
        ]),
      ).rejects.toThrow('Không tìm thấy phòng');

      expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    });

    it('throws VALIDATION_ERROR when buffer magic bytes do not match declared mimetype', async () => {
      const service = new RoomImageService(roomRepository, cloudinaryMediaService);
      const fakeFile = {
        buffer: Buffer.from('this is plain text not an image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      await expect(service.uploadRoomImages(roomId1, [fakeFile])).rejects.toThrow(
        'File ảnh không hợp lệ',
      );
      expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    });

    it('cleans up succeeded uploads in batch when a subsequent upload fails', async () => {
      vi.mocked(cloudinaryMediaService.uploadImage)
        .mockResolvedValueOnce({
          imageUrl: 'https://res.cloudinary.com/img1.jpg',
          publicId: 'co-space/rooms/room-1/img1',
        })
        .mockRejectedValueOnce(new Error('Cloudinary network timeout'));

      const service = new RoomImageService(roomRepository, cloudinaryMediaService);
      const files = [
        { buffer: validJpegBuffer, mimetype: 'image/jpeg' } as Express.Multer.File,
        { buffer: validPngBuffer, mimetype: 'image/png' } as Express.Multer.File,
      ];

      await expect(service.uploadRoomImages(roomId1, files)).rejects.toThrow(
        'Không thể upload ảnh lên dịch vụ lưu trữ',
      );

      expect(cloudinaryMediaService.destroyManyImages).toHaveBeenCalledWith([
        'co-space/rooms/room-1/img1',
      ]);
      expect(roomRepository.appendImages).not.toHaveBeenCalled();
    });

    it('cleans up all batch uploaded assets when database appendImages transaction fails', async () => {
      vi.mocked(cloudinaryMediaService.uploadImage)
        .mockResolvedValueOnce({
          imageUrl: 'https://res.cloudinary.com/img1.jpg',
          publicId: 'co-space/rooms/room-1/img1',
        })
        .mockResolvedValueOnce({
          imageUrl: 'https://res.cloudinary.com/img2.jpg',
          publicId: 'co-space/rooms/room-1/img2',
        });

      vi.mocked(roomRepository.appendImages).mockRejectedValueOnce(
        new Error('Database connection lost'),
      );

      const service = new RoomImageService(roomRepository, cloudinaryMediaService);
      const files = [
        { buffer: validJpegBuffer, mimetype: 'image/jpeg' } as Express.Multer.File,
        { buffer: validPngBuffer, mimetype: 'image/png' } as Express.Multer.File,
      ];

      await expect(service.uploadRoomImages(roomId1, files)).rejects.toThrow(
        'Database connection lost',
      );

      expect(cloudinaryMediaService.destroyManyImages).toHaveBeenCalledWith([
        'co-space/rooms/room-1/img1',
        'co-space/rooms/room-1/img2',
      ]);
    });

    it('does not leak publicId in returned RoomDetail DTO', async () => {
      const service = new RoomImageService(roomRepository, cloudinaryMediaService);
      const files = [{ buffer: validJpegBuffer, mimetype: 'image/jpeg' } as Express.Multer.File];

      const result = await service.uploadRoomImages(roomId1, files);
      expect(result.id).toBe(roomId1);
      expect(result.images).toHaveLength(2);
      expect((result.images[0] as any).publicId).toBeUndefined();
      expect((result.images[1] as any).publicId).toBeUndefined();
      expect((result as any).publicId).toBeUndefined();
    });
  });

  describe('HTTP API - POST /api/v1/admin/rooms/:id/images', () => {
    it('returns 401 UNAUTHORIZED when no authorization token is provided', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/rooms/${roomId1}/images`)
        .attach('images', validJpegBuffer, 'room.jpg');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    });

    it('returns 403 FORBIDDEN when accessed with CUSTOMER role token', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/rooms/${roomId1}/images`)
        .set('Authorization', `Bearer ${customerToken}`)
        .attach('images', validJpegBuffer, 'room.jpg');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when room id is not a valid UUID', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms/not-a-valid-uuid/images')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('images', validJpegBuffer, 'room.jpg');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    });

    it('returns 404 ROOM_NOT_FOUND when room does not exist', async () => {
      vi.mocked(roomRepository.findById).mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/v1/admin/rooms/${roomId1}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('images', validJpegBuffer, 'room.jpg');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ROOM_NOT_FOUND');
      expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when no file is attached in images field', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/rooms/${roomId1}/images`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when unexpected field is used instead of images', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/rooms/${roomId1}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('wrongField', validJpegBuffer, 'room.jpg');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when an unsupported file type is attached', async () => {
      const textBuffer = Buffer.from('hello world plain text');
      const res = await request(app)
        .post(`/api/v1/admin/rooms/${roomId1}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('images', textBuffer, 'doc.txt');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    });

    it('returns 413 FILE_TOO_LARGE when a file exceeds 5MB', async () => {
      const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, 0xff);
      const res = await request(app)
        .post(`/api/v1/admin/rooms/${roomId1}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('images', bigBuffer, 'huge.jpg');

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
    });

    it('returns 201 and updated RoomDetail without publicId on valid upload', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/rooms/${roomId1}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('images', validJpegBuffer, 'photo1.jpg')
        .attach('images', validPngBuffer, 'photo2.png');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Tải ảnh phòng lên thành công');
      expect(res.body.data.id).toBe(roomId1);
      expect(res.body.data.images).toBeDefined();

      // Ensure publicId is nowhere in the response body
      const jsonResponse = JSON.stringify(res.body);
      expect(jsonResponse).not.toContain('publicId');
      expect(jsonResponse).not.toContain('secret-public-id-998877');
    });
  });

  describe('RoomRepository.updateWithRelations concurrency locking', () => {
    it('locks room with SELECT id FROM rooms WHERE id = ? FOR UPDATE and throws 404 if not found', async () => {
      const mockQueryRaw = vi.fn().mockResolvedValue([]);
      const mockTx = {
        $queryRaw: mockQueryRaw,
      };

      const realPrisma = await import('../utils/prisma.util.js');
      vi.mocked(realPrisma.default.$transaction).mockImplementationOnce(async (cb: any) => {
        return cb(mockTx);
      });

      await expect(
        roomRepository.updateWithRelations(roomId1, {
          images: [{ imageUrl: 'https://images.example.com/new.jpg', isPrimary: true }],
        }),
      ).rejects.toThrow('Không tìm thấy phòng');

      expect(mockQueryRaw).toHaveBeenCalled();
    });
  });
});
