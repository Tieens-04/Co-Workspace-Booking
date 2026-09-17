import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';

describe('Room API Integration Tests (Real MySQL Database)', () => {
  const testPrefix = `test_${randomUUID()}`;
  let amenityAId: string;
  let amenityBId: string;
  let amenityCId: string;

  let roomAllId: string;
  let roomPartialId: string;
  let roomNoneId: string;
  let roomNoImageId: string;

  beforeAll(async () => {
    // 1. Create unique test amenities
    const amenityA = await prisma.amenity.create({
      data: {
        name: `${testPrefix}_Wi-Fi`,
        icon: 'wifi',
        description: 'Test High Speed Internet',
      },
    });
    amenityAId = amenityA.id;

    const amenityB = await prisma.amenity.create({
      data: {
        name: `${testPrefix}_Projector`,
        icon: 'projector',
        description: 'Test Projector',
      },
    });
    amenityBId = amenityB.id;

    const amenityC = await prisma.amenity.create({
      data: {
        name: `${testPrefix}_Soundproof`,
        icon: 'volume-x',
        description: 'Test Soundproof',
      },
    });
    amenityCId = amenityC.id;

    // 2. Create room with ALL amenities (A, B, C)
    const roomAll = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room_All`,
        description: 'Room with all amenities',
        capacity: 10,
        pricePerHour: 200.0,
        status: RoomStatus.AVAILABLE,
        createdAt: new Date('2026-01-01T08:00:00Z'),
        images: {
          create: [
            {
              imageUrl: 'https://example.com/sec.jpg',
              publicId: 'sec_pub',
              isPrimary: false,
              createdAt: new Date('2026-01-01T10:00:00Z'),
            },
            {
              imageUrl: 'https://example.com/prim.jpg',
              publicId: 'prim_pub',
              isPrimary: true,
              createdAt: new Date('2026-01-01T11:00:00Z'),
            },
          ],
        },
        amenities: {
          create: [{ amenityId: amenityAId }, { amenityId: amenityBId }, { amenityId: amenityCId }],
        },
      },
    });
    roomAllId = roomAll.id;

    // 3. Create room with PARTIAL amenities (A only)
    const roomPartial = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room_Partial`,
        description: 'Room with only amenity A',
        capacity: 4,
        pricePerHour: 100.0,
        status: RoomStatus.AVAILABLE,
        createdAt: new Date('2026-01-02T08:00:00Z'),
        images: {
          create: [
            {
              imageUrl: 'https://example.com/fallback.jpg',
              publicId: 'fb_pub',
              isPrimary: false,
              createdAt: new Date('2026-01-01T10:00:00Z'),
            },
          ],
        },
        amenities: {
          create: [{ amenityId: amenityAId }],
        },
      },
    });
    roomPartialId = roomPartial.id;

    // 4. Create room with NONE of these amenities, status MAINTENANCE
    const roomNone = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room_None`,
        description: 'Room with no amenities under maintenance',
        capacity: 2,
        pricePerHour: 50.0,
        status: RoomStatus.MAINTENANCE,
      },
    });
    roomNoneId = roomNone.id;

    // 5. Create room with no images
    const roomNoImage = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room_No_Image`,
        description: 'Room without images',
        capacity: 6,
        pricePerHour: 150.0,
        status: RoomStatus.AVAILABLE,
        amenities: {
          create: [{ amenityId: amenityBId }],
        },
      },
    });
    roomNoImageId = roomNoImage.id;
  });

  afterAll(async () => {
    // Delete created rooms (cascades to room_images and room_amenities)
    await prisma.room.deleteMany({
      where: {
        id: { in: [roomAllId, roomPartialId, roomNoneId, roomNoImageId] },
      },
    });

    // Delete created amenities
    await prisma.amenity.deleteMany({
      where: {
        id: { in: [amenityAId, amenityBId, amenityCId] },
      },
    });

    await prisma.$disconnect();
  });

  describe('GET /api/v1/rooms with database queries', () => {
    it('filters rooms by ALL amenities (both A and B required)', async () => {
      const res = await request(app).get(`/api/v1/rooms?amenityIds=${amenityAId},${amenityBId}`);

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      const ids = items.map((r: { id: string }) => r.id);

      // roomAll has A and B -> included
      expect(ids).toContain(roomAllId);
      // roomPartial only has A -> excluded
      expect(ids).not.toContain(roomPartialId);
      // roomNone has neither -> excluded
      expect(ids).not.toContain(roomNoneId);
    });

    it('returns empty items when filtering by a valid non-existent amenity UUID', async () => {
      const nonExistentUuid = randomUUID();
      const res = await request(app).get(`/api/v1/rooms?amenityIds=${nonExistentUuid}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it('combines capacity, minPrice, maxPrice, and amenities', async () => {
      const res = await request(app).get(
        `/api/v1/rooms?capacity=5&minPrice=150&maxPrice=250&amenityIds=${amenityAId}`,
      );

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      const ids = items.map((r: { id: string }) => r.id);

      // roomAll: capacity 10 >= 5, price 200 in [150, 250], has amenityA -> MATCH
      expect(ids).toContain(roomAllId);
      // roomPartial: capacity 4 < 5, price 100 < 150 -> EXCLUDED
      expect(ids).not.toContain(roomPartialId);
    });

    it('applies inclusive filter boundaries', async () => {
      const res = await request(app).get(
        `/api/v1/rooms?capacity=4&minPrice=100.00&maxPrice=200.00&amenityIds=${amenityAId}`,
      );

      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((room: { id: string }) => room.id);
      expect(ids).toEqual(expect.arrayContaining([roomAllId, roomPartialId]));
    });

    it('paginates with stable ordering and preserves database-backed metadata', async () => {
      const firstPage = await request(app).get(
        `/api/v1/rooms?amenityIds=${amenityAId}&page=1&limit=1`,
      );
      const secondPage = await request(app).get(
        `/api/v1/rooms?amenityIds=${amenityAId}&page=2&limit=1`,
      );
      const emptyPage = await request(app).get(
        `/api/v1/rooms?amenityIds=${amenityAId}&page=3&limit=1`,
      );

      expect(firstPage.status).toBe(200);
      expect(firstPage.body.data.items.map((room: { id: string }) => room.id)).toEqual([
        roomPartialId,
      ]);
      expect(firstPage.body.data.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });

      expect(secondPage.status).toBe(200);
      expect(secondPage.body.data.items.map((room: { id: string }) => room.id)).toEqual([
        roomAllId,
      ]);
      expect(secondPage.body.data.pagination).toEqual({
        page: 2,
        limit: 1,
        total: 2,
        totalPages: 2,
      });

      expect(emptyPage.status).toBe(200);
      expect(emptyPage.body.data.items).toEqual([]);
      expect(emptyPage.body.data.pagination).toEqual({
        page: 3,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
    });

    it('correctly resolves cover image with primary priority and fallback', async () => {
      const res = await request(app).get(`/api/v1/rooms?limit=100`);

      expect(res.status).toBe(200);
      const items: { id: string; coverImage: string | null }[] = res.body.data.items;

      const allRoom = items.find((r) => r.id === roomAllId);
      expect(allRoom).toBeDefined();
      expect(allRoom!.coverImage).toBe('https://example.com/prim.jpg');

      const partialRoom = items.find((r) => r.id === roomPartialId);
      expect(partialRoom).toBeDefined();
      expect(partialRoom!.coverImage).toBe('https://example.com/fallback.jpg');

      const noImageRoom = items.find((r) => r.id === roomNoImageId);
      expect(noImageRoom).toBeDefined();
      expect(noImageRoom!.coverImage).toBeNull();
    });
  });

  describe('GET /api/v1/rooms/:id with database relations', () => {
    it('returns full room details with sorted images and amenities', async () => {
      const res = await request(app).get(`/api/v1/rooms/${roomAllId}`);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.id).toBe(roomAllId);
      expect(data.name).toBe(`${testPrefix}_Room_All`);
      expect(data.pricePerHour).toBe('200.00');

      // Primary image must be first
      expect(data.images).toHaveLength(2);
      expect(data.images[0].imageUrl).toBe('https://example.com/prim.jpg');
      expect(data.images[0].isPrimary).toBe(true);
      expect(data.images[1].imageUrl).toBe('https://example.com/sec.jpg');
      expect(data.images[1].isPrimary).toBe(false);

      // Amenities sorted by name
      expect(data.amenities).toHaveLength(3);
      const names = data.amenities.map((a: { name: string }) => a.name);
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sortedNames);
    });

    it('returns 404 ROOM_NOT_FOUND for non-existent room ID', async () => {
      const unusedId = randomUUID();
      const res = await request(app).get(`/api/v1/rooms/${unusedId}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ROOM_NOT_FOUND');
    });
  });
});
