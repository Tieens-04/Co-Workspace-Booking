import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { roomRepository, RoomDetailRecord } from '../repositories/room.repository.js';
import { AppError } from '../utils/error.util.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const validUuid1 = '11111111-1111-4111-8111-111111111111';
const validUuid2 = '22222222-2222-4222-8222-222222222222';
const roomId1 = '33333333-3333-4333-8333-333333333333';

const adminToken = generateToken({ sub: 'admin-uuid-1', role: Role.ADMIN });
const customerToken = generateToken({ sub: 'customer-uuid-1', role: Role.CUSTOMER });

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
    {
      id: 'img-2',
      imageUrl: 'https://images.example.com/side.jpg',
      isPrimary: false,
      createdAt: new Date('2026-01-01T10:05:00Z'),
    },
  ],
  amenities: [
    {
      amenity: {
        id: validUuid1,
        name: '4K Projector',
        icon: 'projector',
        description: 'Ultra HD projector',
      },
    },
    {
      amenity: {
        id: validUuid2,
        name: 'Wi-Fi 6',
        icon: 'wifi',
        description: 'Super fast internet',
      },
    },
  ],
  ...override,
});

describe('Admin Room Management API (/api/v1/admin/rooms)', () => {
  beforeEach(() => {
    vi.spyOn(roomRepository, 'findManyAndCount').mockResolvedValue([1, [mockRoomFixture()]]);
    vi.spyOn(roomRepository, 'findById').mockResolvedValue(mockRoomFixture());
    vi.spyOn(roomRepository, 'createWithRelations').mockResolvedValue(mockRoomFixture());
    vi.spyOn(roomRepository, 'updateWithRelations').mockResolvedValue(mockRoomFixture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & RBAC Controls', () => {
    it('returns 401 UNAUTHORIZED when no token is provided to GET /api/v1/admin/rooms', async () => {
      const res = await request(app).get('/api/v1/admin/rooms');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 UNAUTHORIZED when no token is provided to POST /api/v1/admin/rooms', async () => {
      const res = await request(app).post('/api/v1/admin/rooms').send({
        name: 'Test Room',
        capacity: 4,
        pricePerHour: '100.00',
      });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 UNAUTHORIZED when no token is provided to PATCH /api/v1/admin/rooms/:id', async () => {
      const res = await request(app).patch(`/api/v1/admin/rooms/${roomId1}`).send({
        name: 'Updated Name',
      });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses GET /api/v1/admin/rooms', async () => {
      const res = await request(app)
        .get('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses POST /api/v1/admin/rooms', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Test Room',
          capacity: 4,
          pricePerHour: '100.00',
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses PATCH /api/v1/admin/rooms/:id', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${roomId1}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Updated Name',
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/admin/rooms (Admin List Access)', () => {
    it('returns 200 and room list with pagination when called by ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/rooms?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Executive Boardroom');
      expect(roomRepository.findManyAndCount).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
    });
  });

  describe('POST /api/v1/admin/rooms (Create Room)', () => {
    const validCreatePayload = {
      name: 'Creative Studio',
      description: 'Well equipped studio space',
      capacity: 8,
      pricePerHour: '250.00',
      amenityIds: [validUuid1, validUuid2],
      images: [
        { imageUrl: 'https://images.example.com/studio1.jpg', isPrimary: true },
        { imageUrl: 'https://images.example.com/studio2.jpg', isPrimary: false },
      ],
    };

    it('creates a room successfully and returns 201 with RoomDetail', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Tạo phòng thành công');
      expect(res.body.data.id).toBe(roomId1);
      expect(res.body.data.pricePerHour).toBe('350.00');
      expect(roomRepository.createWithRelations).toHaveBeenCalledWith({
        name: 'Creative Studio',
        description: 'Well equipped studio space',
        capacity: 8,
        pricePerHour: '250.00',
        amenityIds: [validUuid1, validUuid2],
        images: validCreatePayload.images,
      });
    });

    it('allows creating room without optional description, amenities, and images', async () => {
      const minimalPayload = {
        name: 'Minimal Room',
        capacity: 2,
        pricePerHour: 100,
      };

      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(minimalPayload);

      expect(res.status).toBe(201);
      expect(roomRepository.createWithRelations).toHaveBeenCalledWith({
        name: 'Minimal Room',
        description: undefined,
        capacity: 2,
        pricePerHour: '100.00',
        amenityIds: [],
        images: [],
      });
    });

    it('normalizes empty description to null', async () => {
      const payload = {
        name: 'Room Empty Desc',
        description: '   ',
        capacity: 4,
        pricePerHour: '120.00',
      };

      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(roomRepository.createWithRelations).toHaveBeenCalledWith(
        expect.objectContaining({
          description: null,
        }),
      );
    });

    it('rejects creation when name is missing or empty', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '   ',
          capacity: 4,
          pricePerHour: '100.00',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects creation when name exceeds 191 characters', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'A'.repeat(192),
          capacity: 4,
          pricePerHour: '100.00',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it.each([0, -1, 3.5, 'abc', 2_147_483_648])(
      'rejects invalid capacity: %s',
      async (capacity) => {
        const res = await request(app)
          .post('/api/v1/admin/rooms')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Valid Name',
            capacity,
            pricePerHour: '100.00',
          });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      },
    );

    it.each([-10, 'not-a-number', '10.555', 100000000])(
      'rejects invalid pricePerHour: %s',
      async (pricePerHour) => {
        const res = await request(app)
          .post('/api/v1/admin/rooms')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Valid Name',
            capacity: 4,
            pricePerHour,
          });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      },
    );

    it('rejects duplicate amenityIds', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Amenities',
          capacity: 4,
          pricePerHour: '100.00',
          amenityIds: [validUuid1, validUuid1],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid image URL format', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Image',
          capacity: 4,
          pricePerHour: '100.00',
          images: [{ imageUrl: 'ftp://not-http.com/image.png', isPrimary: true }],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate image URLs', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Images',
          capacity: 4,
          pricePerHour: '100.00',
          images: [
            { imageUrl: 'https://example.com/img1.jpg', isPrimary: true },
            { imageUrl: 'https://example.com/img1.jpg', isPrimary: false },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects images when no image is marked as primary', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'No Primary',
          capacity: 4,
          pricePerHour: '100.00',
          images: [
            { imageUrl: 'https://example.com/img1.jpg', isPrimary: false },
            { imageUrl: 'https://example.com/img2.jpg', isPrimary: false },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects images when multiple images are marked as primary', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Multiple Primary',
          capacity: 4,
          pricePerHour: '100.00',
          images: [
            { imageUrl: 'https://example.com/img1.jpg', isPrimary: true },
            { imageUrl: 'https://example.com/img2.jpg', isPrimary: true },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects forbidden/unknown fields to prevent mass assignment (e.g. status, id, createdAt)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Mass Assign',
          capacity: 4,
          pricePerHour: '100.00',
          status: 'MAINTENANCE',
          id: roomId1,
          createdAt: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/v1/admin/rooms/:id (Update Room)', () => {
    it('updates room partially and returns 200 with RoomDetail', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${roomId1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Boardroom',
          capacity: 16,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Cập nhật thông tin phòng thành công');
      expect(roomRepository.updateWithRelations).toHaveBeenCalledWith(roomId1, {
        name: 'Updated Boardroom',
        capacity: 16,
      });
    });

    it('preserves relations when amenityIds or images are omitted', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${roomId1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pricePerHour: '400.00',
        });

      expect(res.status).toBe(200);
      expect(roomRepository.updateWithRelations).toHaveBeenCalledWith(roomId1, {
        pricePerHour: '400.00',
      });
    });

    it('replaces relations when amenityIds or images are provided as non-empty arrays', async () => {
      const newImages = [
        { imageUrl: 'https://images.example.com/new-primary.jpg', isPrimary: true },
      ];

      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${roomId1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amenityIds: [validUuid2],
          images: newImages,
        });

      expect(res.status).toBe(200);
      expect(roomRepository.updateWithRelations).toHaveBeenCalledWith(roomId1, {
        amenityIds: [validUuid2],
        images: newImages,
      });
    });

    it('clears relations when amenityIds or images are sent as empty arrays []', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${roomId1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amenityIds: [],
          images: [],
        });

      expect(res.status).toBe(200);
      expect(roomRepository.updateWithRelations).toHaveBeenCalledWith(roomId1, {
        amenityIds: [],
        images: [],
      });
    });

    it('rejects empty body {} on PATCH', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${roomId1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid room ID format on PATCH', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/rooms/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Valid' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 ROOM_NOT_FOUND when updating non-existent room', async () => {
      vi.mocked(roomRepository.updateWithRelations).mockRejectedValueOnce(
        new AppError('ROOM_NOT_FOUND', 'Không tìm thấy phòng', 404),
      );

      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${roomId1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Non Existent' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ROOM_NOT_FOUND');
    });

    it('returns 400 INVALID_AMENITY_IDS when any amenityId does not exist', async () => {
      vi.mocked(roomRepository.createWithRelations).mockRejectedValueOnce(
        new AppError('INVALID_AMENITY_IDS', 'Một hoặc nhiều tiện ích không tồn tại', 400, {
          missingIds: [validUuid1],
        }),
      );

      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Room Bad Amenities',
          capacity: 4,
          pricePerHour: '100.00',
          amenityIds: [validUuid1],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_AMENITY_IDS');
      expect(res.body.details).toEqual({ missingIds: [validUuid1] });
    });
  });
});
