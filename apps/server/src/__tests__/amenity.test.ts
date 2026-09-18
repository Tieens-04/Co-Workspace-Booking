import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { amenityRepository, AmenityRecord } from '../repositories/amenity.repository.js';

vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const mockAmenities: AmenityRecord[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Coffee & Tea',
    icon: 'coffee',
    description: 'Miễn phí trà và cà phê',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'High-Speed Wi-Fi',
    icon: 'wifi',
    description: 'Kết nối mạng cáp quang tốc độ cao',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Whiteboard',
    icon: 'board',
    description: 'Bảng viết dạ lớn',
  },
];

beforeEach(() => {
  vi.spyOn(amenityRepository, 'findAll').mockResolvedValue(mockAmenities);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Amenity HTTP Regressions (Mocked Repository)', () => {
  describe('Public Access & Response Shape', () => {
    it('GET /api/v1/amenities is public, requires no token, and returns 200 with envelope', async () => {
      const res = await request(app).get('/api/v1/amenities');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lấy danh sách tiện ích thành công');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(amenityRepository.findAll).toHaveBeenCalledTimes(1);
    });

    it('returns data in ascending order by name and does not leak internal schema fields', async () => {
      const res = await request(app).get('/api/v1/amenities');

      expect(res.status).toBe(200);
      const items = res.body.data;
      expect(items[0].name).toBe('Coffee & Tea');
      expect(items[1].name).toBe('High-Speed Wi-Fi');
      expect(items[2].name).toBe('Whiteboard');

      // Verify each item structure
      for (const item of items) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('icon');
        expect(item).toHaveProperty('description');

        // Check no internal fields leaked
        expect(item.createdAt).toBeUndefined();
        expect(item.updatedAt).toBeUndefined();
        expect(item.rooms).toBeUndefined();
      }
    });

    it('returns empty array when no amenities exist in system', async () => {
      vi.mocked(amenityRepository.findAll).mockResolvedValue([]);

      const res = await request(app).get('/api/v1/amenities');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('Query Validation (Strict Whitelisting)', () => {
    it.each([
      { query: '?sort=asc', desc: 'sort param' },
      { query: '?page=1', desc: 'page param' },
      { query: '?limit=10', desc: 'limit param' },
      { query: '?q=wifi', desc: 'search query' },
      { query: '?foo=bar', desc: 'arbitrary query' },
    ])('rejects unexpected query param: $desc with 400 VALIDATION_ERROR', async ({ query }) => {
      const res = await request(app).get(`/api/v1/amenities${query}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(amenityRepository.findAll).not.toHaveBeenCalled();
    });
  });
});
