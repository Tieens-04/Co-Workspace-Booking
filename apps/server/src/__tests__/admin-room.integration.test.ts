import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { roomRepository } from '../repositories/room.repository.js';

describe('Admin Room API Integration Tests (Real MySQL Database & Transactions)', () => {
  const testPrefix = `test_admin_${randomUUID()}`;
  const adminToken = generateToken({ sub: `admin_${randomUUID()}`, role: Role.ADMIN });

  let amenity1Id: string;
  let amenity2Id: string;
  let createdRoomId: string;

  beforeAll(async () => {
    // Create test amenities
    const a1 = await prisma.amenity.create({
      data: {
        name: `${testPrefix}_Whiteboard`,
        icon: 'board',
        description: 'Magnetic whiteboard',
      },
    });
    amenity1Id = a1.id;

    const a2 = await prisma.amenity.create({
      data: {
        name: `${testPrefix}_ConferencePhone`,
        icon: 'phone',
        description: 'Polycom phone system',
      },
    });
    amenity2Id = a2.id;
  });

  afterAll(async () => {
    if (createdRoomId) {
      await prisma.room.deleteMany({
        where: { id: createdRoomId },
      });
    }

    await prisma.amenity.deleteMany({
      where: {
        id: { in: [amenity1Id, amenity2Id] },
      },
    });

    await prisma.$disconnect();
  });

  describe('POST /api/v1/admin/rooms (Database Persistence & Relations)', () => {
    it('creates room, room_amenities, and room_images with publicId = null in single transaction', async () => {
      const payload = {
        name: `${testPrefix}_Room_Main`,
        description: 'Integration test room description',
        capacity: 8,
        pricePerHour: '180.50',
        amenityIds: [amenity1Id, amenity2Id],
        images: [
          { imageUrl: 'https://images.example.com/p1.jpg', isPrimary: true },
          { imageUrl: 'https://images.example.com/p2.jpg', isPrimary: false },
        ],
      };

      const res = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(payload.name);
      expect(res.body.data.pricePerHour).toBe('180.50');
      expect(res.body.data.status).toBe(RoomStatus.AVAILABLE);

      createdRoomId = res.body.data.id;

      // Verify directly in DB
      const dbRoom = await prisma.room.findUnique({
        where: { id: createdRoomId },
        include: {
          amenities: true,
          images: true,
        },
      });

      expect(dbRoom).not.toBeNull();
      expect(dbRoom!.name).toBe(payload.name);
      expect(dbRoom!.description).toBe(payload.description);
      expect(dbRoom!.capacity).toBe(8);
      expect(dbRoom!.status).toBe(RoomStatus.AVAILABLE);

      // Verify DB amenities
      expect(dbRoom!.amenities).toHaveLength(2);
      const dbAmenityIds = dbRoom!.amenities.map((a) => a.amenityId);
      expect(dbAmenityIds).toContain(amenity1Id);
      expect(dbAmenityIds).toContain(amenity2Id);

      // Verify DB images
      expect(dbRoom!.images).toHaveLength(2);
      for (const img of dbRoom!.images) {
        expect(img.publicId).toBeNull();
      }
      const primaryImg = dbRoom!.images.find((img) => img.isPrimary);
      expect(primaryImg).toBeDefined();
      expect(primaryImg!.imageUrl).toBe('https://images.example.com/p1.jpg');
    });
  });

  describe('PATCH /api/v1/admin/rooms/:id (Atomic Update & Sync)', () => {
    it('updates scalars and synchronizes amenities and images atomically', async () => {
      const patchPayload = {
        name: `${testPrefix}_Room_Main_Updated`,
        description: 'Updated description',
        capacity: 10,
        pricePerHour: '220.00',
        amenityIds: [amenity2Id], // Removed amenity1
        images: [
          // Replaced with single image
          { imageUrl: 'https://images.example.com/new_cover.jpg', isPrimary: true },
        ],
      };

      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(patchPayload);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe(patchPayload.name);
      expect(res.body.data.capacity).toBe(10);
      expect(res.body.data.pricePerHour).toBe('220.00');
      expect(res.body.data.amenities).toHaveLength(1);
      expect(res.body.data.amenities[0].id).toBe(amenity2Id);
      expect(res.body.data.images).toHaveLength(1);
      expect(res.body.data.images[0].imageUrl).toBe('https://images.example.com/new_cover.jpg');

      // Verify DB state
      const dbRoom = await prisma.room.findUnique({
        where: { id: createdRoomId },
        include: {
          amenities: true,
          images: true,
        },
      });

      expect(dbRoom!.name).toBe(patchPayload.name);
      expect(dbRoom!.capacity).toBe(10);
      expect(dbRoom!.amenities).toHaveLength(1);
      expect(dbRoom!.amenities[0].amenityId).toBe(amenity2Id);
      expect(dbRoom!.images).toHaveLength(1);
      expect(dbRoom!.images[0].imageUrl).toBe('https://images.example.com/new_cover.jpg');
      expect(dbRoom!.images[0].publicId).toBeNull();
    });

    it('rejects an invalid amenity before changing room scalars', async () => {
      const nonExistentAmenityId = randomUUID();

      // Attempt to patch with an invalid amenity ID
      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `${testPrefix}_Should_Rollback`,
          capacity: 99,
          amenityIds: [nonExistentAmenityId],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_AMENITY_IDS');

      // Verify DB was NOT updated (rollback succeeded)
      const dbRoom = await prisma.room.findUnique({
        where: { id: createdRoomId },
      });

      expect(dbRoom!.name).toBe(`${testPrefix}_Room_Main_Updated`);
      expect(dbRoom!.capacity).toBe(10);
    });

    it('rolls back scalar and relation changes when a later relation write fails', async () => {
      const before = await prisma.room.findUnique({
        where: { id: createdRoomId },
        include: { amenities: true, images: true },
      });

      await expect(
        roomRepository.updateWithRelations(createdRoomId, {
          name: `${testPrefix}_Must_Rollback`,
          capacity: 99,
          amenityIds: [amenity1Id],
          images: [{ imageUrl: null as unknown as string, isPrimary: true }],
        }),
      ).rejects.toThrow();

      const after = await prisma.room.findUnique({
        where: { id: createdRoomId },
        include: { amenities: true, images: true },
      });

      expect(after!.name).toBe(before!.name);
      expect(after!.capacity).toBe(before!.capacity);
      expect(after!.amenities.map((item) => item.amenityId).sort()).toEqual(
        before!.amenities.map((item) => item.amenityId).sort(),
      );
      expect(after!.images.map((item) => item.imageUrl).sort()).toEqual(
        before!.images.map((item) => item.imageUrl).sort(),
      );
    });
  });
});
