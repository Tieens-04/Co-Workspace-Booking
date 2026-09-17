import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Prisma, RoomStatus } from '@prisma/client';
import app from '../app.js';
import { roomRepository, RoomDetailRecord } from '../repositories/room.repository.js';

vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const validUuid1 = '11111111-1111-4111-8111-111111111111';
const validUuid2 = '22222222-2222-4222-8222-222222222222';
const validUuid3 = '33333333-3333-4333-8333-333333333333';
const roomId1 = '44444444-4444-4444-8444-444444444444';
const roomId2 = '55555555-5555-4555-8555-555555555555';

const mockRoomFixture = (override?: Partial<RoomDetailRecord>): RoomDetailRecord => ({
  id: roomId1,
  name: 'Focus Room A',
  description: 'A cozy focus room',
  capacity: 4,
  pricePerHour: new Prisma.Decimal('150.50'),
  status: RoomStatus.AVAILABLE,
  images: [
    {
      id: 'img-1',
      imageUrl: 'https://images.example.com/secondary.jpg',
      isPrimary: false,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    },
    {
      id: 'img-2',
      imageUrl: 'https://images.example.com/primary.jpg',
      isPrimary: true,
      createdAt: new Date('2026-01-01T11:00:00Z'),
    },
  ],
  amenities: [
    {
      amenity: {
        id: validUuid2,
        name: 'Wi-Fi 6',
        icon: 'wifi',
        description: 'Fast Internet',
      },
    },
    {
      amenity: {
        id: validUuid1,
        name: 'Coffee & Tea',
        icon: 'coffee',
        description: 'Free coffee',
      },
    },
  ],
  ...override,
});

beforeEach(() => {
  vi.spyOn(roomRepository, 'findManyAndCount').mockResolvedValue([1, [mockRoomFixture()]]);
  vi.spyOn(roomRepository, 'findById').mockResolvedValue(mockRoomFixture());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Room List & Detail HTTP Regressions (Mocked Repository)', () => {
  describe('Public Access & Defaults', () => {
    it('GET /api/v1/rooms is public, requires no token, and applies default pagination', async () => {
      const res = await request(app).get('/api/v1/rooms');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(roomRepository.findManyAndCount).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
    });

    it('GET /api/v1/rooms/:id is public, requires no token, and returns 200 for existing room', async () => {
      const res = await request(app).get(`/api/v1/rooms/${roomId1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(roomId1);
      expect(roomRepository.findById).toHaveBeenCalledWith(roomId1);
    });

    it('handles out-of-range page by returning empty items without error', async () => {
      vi.mocked(roomRepository.findManyAndCount).mockResolvedValue([5, []]);

      const res = await request(app).get('/api/v1/rooms?page=10&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination).toEqual({
        page: 10,
        limit: 10,
        total: 5,
        totalPages: 1,
      });
    });

    it('returns totalPages = 0 when total is 0', async () => {
      vi.mocked(roomRepository.findManyAndCount).mockResolvedValue([0, []]);

      const res = await request(app).get('/api/v1/rooms');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });
  });

  describe('Query Parsing, Filters & Amenity Semantics', () => {
    it('parses CSV amenityIds, trims whitespace, deduplicates, and passes array to repository', async () => {
      const res = await request(app).get(
        `/api/v1/rooms?amenityIds= ${validUuid1} , ${validUuid2} , ${validUuid1} `,
      );

      expect(res.status).toBe(200);
      expect(roomRepository.findManyAndCount).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        amenityIds: [validUuid1, validUuid2],
      });
    });

    it('parses capacity, minPrice, and maxPrice numbers correctly', async () => {
      const res = await request(app).get(
        '/api/v1/rooms?capacity=6&minPrice=50.00&maxPrice=250.75&page=2&limit=20',
      );

      expect(res.status).toBe(200);
      expect(roomRepository.findManyAndCount).toHaveBeenCalledWith({
        page: 2,
        limit: 20,
        capacity: 6,
        minPrice: '50.00',
        maxPrice: '250.75',
      });
    });

    it('accepts zero for minPrice and maxPrice (non-negative)', async () => {
      const res = await request(app).get('/api/v1/rooms?minPrice=0&maxPrice=0');

      expect(res.status).toBe(200);
      expect(roomRepository.findManyAndCount).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        minPrice: '0.00',
        maxPrice: '0.00',
      });
    });
  });

  describe('Validation & Rejections (400 VALIDATION_ERROR)', () => {
    it.each([
      { query: '?page=0', desc: 'page=0' },
      { query: '?page=-1', desc: 'negative page' },
      { query: '?page=1.5', desc: 'decimal page' },
      { query: '?page=abc', desc: 'string page' },
      { query: '?limit=0', desc: 'limit=0' },
      { query: '?limit=101', desc: 'limit>100' },
      { query: '?limit=-5', desc: 'negative limit' },
      { query: '?capacity=0', desc: 'capacity=0' },
      { query: '?capacity=-2', desc: 'negative capacity' },
      { query: '?capacity=2147483648', desc: 'capacity above MySQL INT range' },
      { query: '?minPrice=-10', desc: 'negative minPrice' },
      { query: '?maxPrice=-5', desc: 'negative maxPrice' },
      { query: '?minPrice=0.001', desc: 'price with more than two decimal places' },
      { query: '?maxPrice=100000000.00', desc: 'price above DECIMAL(10,2) range' },
      {
        query: `?page=${'9'.repeat(100)}`,
        desc: 'page too large for a safe database offset',
      },
      {
        query: `?minPrice=${'9'.repeat(400)}`,
        desc: 'price that transforms to Infinity',
      },
      { query: '?page=2147483647&limit=100', desc: 'page/limit offset overflow' },
      { query: '?minPrice=200&maxPrice=100', desc: 'minPrice > maxPrice' },
      { query: '?amenityIds=not-a-uuid', desc: 'malformed amenity UUID' },
      { query: '?amenityIds=', desc: 'empty amenityIds string' },
      { query: `?amenityIds=${validUuid1},,${validUuid2}`, desc: 'empty slot in CSV' },
      { query: '?sort=asc', desc: 'unwhitelisted query key (sort)' },
      { query: '?order=desc', desc: 'unwhitelisted query key (order)' },
      { query: '?unknownParam=foo', desc: 'unwhitelisted query key (unknownParam)' },
    ])('rejects invalid query before database access: $desc', async ({ query }) => {
      const res = await request(app).get(`/api/v1/rooms${query}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(roomRepository.findManyAndCount).not.toHaveBeenCalled();
    });

    it('rejects invalid room ID path parameter with 400 VALIDATION_ERROR', async () => {
      const res = await request(app).get('/api/v1/rooms/not-a-valid-uuid');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(roomRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('Response Transformations & Invariants', () => {
    it('serializes pricePerHour to two-decimal string and selects primary coverImage', async () => {
      const res = await request(app).get('/api/v1/rooms');

      expect(res.status).toBe(200);
      const item = res.body.data.items[0];
      expect(item.id).toBe(roomId1);
      expect(item.name).toBe('Focus Room A');
      expect(item.capacity).toBe(4);
      expect(item.status).toBe('AVAILABLE');
      expect(item.pricePerHour).toBe('150.50');
      // Cover image should resolve to primary image ('img-2')
      expect(item.coverImage).toBe('https://images.example.com/primary.jpg');

      // Check amenities mapping and alphabetical sorting
      expect(item.amenities).toHaveLength(2);
      expect(item.amenities[0].name).toBe('Coffee & Tea');
      expect(item.amenities[1].name).toBe('Wi-Fi 6');

      // Check no internal fields leaked
      expect(item.createdAt).toBeUndefined();
      expect(item.updatedAt).toBeUndefined();
      expect(item.images).toBeUndefined();
      expect(item.amenities[0].roomId).toBeUndefined();
      expect(item.amenities[0].amenityId).toBeUndefined();
      expect(item.amenities[0].createdAt).toBeUndefined();
    });

    it('coverImage fallback: picks first image by createdAt/id when no primary image exists', async () => {
      const roomWithoutPrimary = mockRoomFixture({
        images: [
          {
            id: 'img-b',
            imageUrl: 'https://images.example.com/b.jpg',
            isPrimary: false,
            createdAt: new Date('2026-01-02T10:00:00Z'),
          },
          {
            id: 'img-a',
            imageUrl: 'https://images.example.com/a.jpg',
            isPrimary: false,
            createdAt: new Date('2026-01-01T10:00:00Z'),
          },
        ],
      });
      vi.mocked(roomRepository.findManyAndCount).mockResolvedValue([1, [roomWithoutPrimary]]);

      const res = await request(app).get('/api/v1/rooms');

      expect(res.status).toBe(200);
      expect(res.body.data.items[0].coverImage).toBe('https://images.example.com/a.jpg');
    });

    it('coverImage fallback: returns null when room has no images', async () => {
      const roomNoImages = mockRoomFixture({ images: [] });
      vi.mocked(roomRepository.findManyAndCount).mockResolvedValue([1, [roomNoImages]]);

      const res = await request(app).get('/api/v1/rooms');

      expect(res.status).toBe(200);
      expect(res.body.data.items[0].coverImage).toBeNull();
    });

    it('returns 404 ROOM_NOT_FOUND when room ID is valid UUID but does not exist', async () => {
      vi.mocked(roomRepository.findById).mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/rooms/${roomId2}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ROOM_NOT_FOUND');
      expect(res.body.message).toBe('Không tìm thấy phòng');
    });

    it('detail endpoint: returns full details, primary image first, amenities sorted by name, no leaked internal fields', async () => {
      const res = await request(app).get(`/api/v1/rooms/${roomId1}`);

      expect(res.status).toBe(200);
      const detail = res.body.data;
      expect(detail.id).toBe(roomId1);
      expect(detail.name).toBe('Focus Room A');
      expect(detail.description).toBe('A cozy focus room');
      expect(detail.capacity).toBe(4);
      expect(detail.pricePerHour).toBe('150.50');
      expect(detail.status).toBe('AVAILABLE');

      // Primary image must be first
      expect(detail.images).toHaveLength(2);
      expect(detail.images[0].id).toBe('img-2');
      expect(detail.images[0].isPrimary).toBe(true);
      expect(detail.images[1].id).toBe('img-1');
      expect(detail.images[1].isPrimary).toBe(false);

      // No publicId or roomId leaked
      expect(detail.images[0].publicId).toBeUndefined();
      expect(detail.images[0].roomId).toBeUndefined();
      expect(detail.images[0].createdAt).toBeUndefined();

      // Amenities sorted by name
      expect(detail.amenities).toHaveLength(2);
      expect(detail.amenities[0].name).toBe('Coffee & Tea');
      expect(detail.amenities[1].name).toBe('Wi-Fi 6');
      expect(detail.amenities[0].roomId).toBeUndefined();
      expect(detail.amenities[0].amenityId).toBeUndefined();
    });
  });

  describe('Repository buildWhere Logic (Prisma Query Contract)', () => {
    it('creates accurate Prisma where condition with ALL amenity semantics', () => {
      const where = roomRepository.buildWhere({
        page: 1,
        limit: 10,
        capacity: 8,
        minPrice: '100.00',
        maxPrice: '300.00',
        amenityIds: [validUuid1, validUuid2, validUuid3],
      });

      expect(where.capacity).toEqual({ gte: 8 });
      expect(where.pricePerHour).toEqual({ gte: '100.00', lte: '300.00' });
      expect(where.AND).toEqual([
        { amenities: { some: { amenityId: validUuid1 } } },
        { amenities: { some: { amenityId: validUuid2 } } },
        { amenities: { some: { amenityId: validUuid3 } } },
      ]);
    });

    it('omits undefined filter clauses in buildWhere', () => {
      const where = roomRepository.buildWhere({
        page: 1,
        limit: 10,
      });

      expect(where.capacity).toBeUndefined();
      expect(where.pricePerHour).toBeUndefined();
      expect(where.AND).toBeUndefined();
    });
  });
});
