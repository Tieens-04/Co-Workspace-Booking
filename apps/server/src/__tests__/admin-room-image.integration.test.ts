import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Prisma, RoomStatus } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { roomRepository } from '../repositories/room.repository.js';

describe('Room Image Integration Tests (Real MySQL & Concurrency Locking)', () => {
  const testPrefix = `test_img_${randomUUID()}`;
  let testRoomId1: string;
  let testRoomId2: string;
  let testRoomId3: string;
  let testRoomId4: string;

  beforeAll(async () => {
    const room1 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room_Empty`,
        capacity: 10,
        pricePerHour: new Prisma.Decimal('200000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    testRoomId1 = room1.id;

    const room2 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room_Concurrent`,
        capacity: 8,
        pricePerHour: new Prisma.Decimal('150000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    testRoomId2 = room2.id;

    const room3 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room_Reconcile`,
        capacity: 6,
        pricePerHour: new Prisma.Decimal('120000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    testRoomId3 = room3.id;

    const room4 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room_PatchAppendRace`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('90000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    testRoomId4 = room4.id;
  });

  afterAll(async () => {
    const ids = [testRoomId1, testRoomId2, testRoomId3, testRoomId4].filter(Boolean);
    if (ids.length > 0) {
      await prisma.room.deleteMany({
        where: { id: { in: ids } },
      });
    }
    await prisma.$disconnect();
  });

  it('appends images to room with non-null public_id and deterministic primary assignment', async () => {
    const publicId1 = `co-space/rooms/${testRoomId1}/img_1`;
    const publicId2 = `co-space/rooms/${testRoomId1}/img_2`;

    const result = await roomRepository.appendImages(testRoomId1, [
      {
        imageUrl: `https://res.cloudinary.com/test/${publicId1}.jpg`,
        publicId: publicId1,
      },
      {
        imageUrl: `https://res.cloudinary.com/test/${publicId2}.jpg`,
        publicId: publicId2,
      },
    ]);

    expect(result.id).toBe(testRoomId1);
    expect(result.images).toHaveLength(2);

    // Query MySQL table room_images directly
    const dbImages = await prisma.roomImage.findMany({
      where: { roomId: testRoomId1 },
    });

    expect(dbImages).toHaveLength(2);

    const dbImage1 = dbImages.find((image) => image.publicId === publicId1);
    const dbImage2 = dbImages.find((image) => image.publicId === publicId2);

    expect(dbImage1).toBeDefined();
    expect(dbImage1?.isPrimary).toBe(true);

    expect(dbImage2).toBeDefined();
    expect(dbImage2?.isPrimary).toBe(false);

    // Now append a 3rd image to the room that already has a primary
    const publicId3 = `co-space/rooms/${testRoomId1}/img_3`;
    await roomRepository.appendImages(testRoomId1, [
      {
        imageUrl: `https://res.cloudinary.com/test/${publicId3}.jpg`,
        publicId: publicId3,
      },
    ]);

    const allDbImages = await prisma.roomImage.findMany({
      where: { roomId: testRoomId1 },
    });

    expect(allDbImages).toHaveLength(3);

    const originalPrimary = allDbImages.find((image) => image.publicId === publicId1);
    const originalSecondary = allDbImages.find((image) => image.publicId === publicId2);
    const appendedImage = allDbImages.find((image) => image.publicId === publicId3);

    expect(originalPrimary).toBeDefined();
    expect(originalPrimary?.isPrimary).toBe(true);
    expect(originalSecondary).toBeDefined();
    expect(originalSecondary?.isPrimary).toBe(false);
    expect(appendedImage).toBeDefined();
    expect(appendedImage?.isPrimary).toBe(false);
  });

  it('prevents double primary assignment under concurrent appends using row locking', async () => {
    // Both batches run concurrently on an initially empty room
    const batchA = [
      {
        imageUrl: `https://res.cloudinary.com/test/batchA_1.jpg`,
        publicId: `co-space/rooms/${testRoomId2}/batchA_1`,
      },
      {
        imageUrl: `https://res.cloudinary.com/test/batchA_2.jpg`,
        publicId: `co-space/rooms/${testRoomId2}/batchA_2`,
      },
    ];

    const batchB = [
      {
        imageUrl: `https://res.cloudinary.com/test/batchB_1.jpg`,
        publicId: `co-space/rooms/${testRoomId2}/batchB_1`,
      },
      {
        imageUrl: `https://res.cloudinary.com/test/batchB_2.jpg`,
        publicId: `co-space/rooms/${testRoomId2}/batchB_2`,
      },
    ];

    // Execute concurrently
    const [resA, resB] = await Promise.all([
      roomRepository.appendImages(testRoomId2, batchA),
      roomRepository.appendImages(testRoomId2, batchB),
    ]);

    expect(resA).toBeDefined();
    expect(resB).toBeDefined();

    // Query MySQL table room_images directly
    const imagesInDb = await prisma.roomImage.findMany({
      where: { roomId: testRoomId2 },
    });

    expect(imagesInDb).toHaveLength(4);

    // Crucial domain invariant: exactly ONE image across both batches must be primary!
    const primaryImages = imagesInDb.filter((img) => img.isPrimary);
    expect(primaryImages).toHaveLength(1);
  });

  it('reconciles images during PATCH, preserving publicId for retained URLs and collecting removed publicIds', async () => {
    // 1. Initial image with publicId
    const initialPublicId = `co-space/rooms/${testRoomId3}/initial`;
    const initialUrl = `https://res.cloudinary.com/test/${initialPublicId}.jpg`;

    await roomRepository.appendImages(testRoomId3, [
      {
        imageUrl: initialUrl,
        publicId: initialPublicId,
      },
    ]);

    // Verify initial row
    const beforePatch = await prisma.roomImage.findFirst({
      where: { roomId: testRoomId3 },
    });
    expect(beforePatch?.publicId).toBe(initialPublicId);

    // 2. Patch room: retain initialUrl, add new manual URL, remove nothing
    const manualUrl = 'https://images.example.com/manual-secondary.jpg';
    const patchResult1 = await roomRepository.updateWithRelations(testRoomId3, {
      name: `${testPrefix}_Room_Reconciled_1`,
      images: [
        { imageUrl: initialUrl, isPrimary: true },
        { imageUrl: manualUrl, isPrimary: false },
      ],
    });

    expect(patchResult1.removedPublicIds).toEqual([]);

    const imagesAfterPatch1 = await prisma.roomImage.findMany({
      where: { roomId: testRoomId3 },
      orderBy: { createdAt: 'asc' },
    });
    expect(imagesAfterPatch1).toHaveLength(2);
    // Preserved publicId!
    const retainedImage = imagesAfterPatch1.find((img) => img.imageUrl === initialUrl);
    expect(retainedImage?.publicId).toBe(initialPublicId);
    expect(retainedImage?.id).toBe(beforePatch?.id);

    // Manual image has publicId null
    const newImage = imagesAfterPatch1.find((img) => img.imageUrl === manualUrl);
    expect(newImage?.publicId).toBeNull();

    // 3. Patch room again: remove initialUrl, keep only manualUrl
    const patchResult2 = await roomRepository.updateWithRelations(testRoomId3, {
      images: [{ imageUrl: manualUrl, isPrimary: true }],
    });

    // The removed initialPublicId is reported for cleanup!
    expect(patchResult2.removedPublicIds).toEqual([initialPublicId]);

    const imagesAfterPatch2 = await prisma.roomImage.findMany({
      where: { roomId: testRoomId3 },
    });
    expect(imagesAfterPatch2).toHaveLength(1);
    expect(imagesAfterPatch2[0].imageUrl).toBe(manualUrl);
    expect(imagesAfterPatch2[0].isPrimary).toBe(true);
  });

  it('prevents double primary assignment under concurrent PATCH and append using row locking', async () => {
    const patchImages = [
      {
        imageUrl: 'https://images.example.com/patch-primary.jpg',
        isPrimary: true,
      },
    ];

    const appendImages = [
      {
        imageUrl: 'https://res.cloudinary.com/test/append-image.jpg',
        publicId: `co-space/rooms/${testRoomId4}/append-image`,
      },
    ];

    // Execute PATCH and append concurrently on empty room
    await Promise.all([
      roomRepository.updateWithRelations(testRoomId4, { images: patchImages }),
      roomRepository.appendImages(testRoomId4, appendImages),
    ]);

    const imagesInDb = await prisma.roomImage.findMany({
      where: { roomId: testRoomId4 },
    });

    expect(imagesInDb.length).toBeGreaterThanOrEqual(1);

    // CRITICAL: Exactly ONE primary image must exist across both operations!
    const primaryImages = imagesInDb.filter((img) => img.isPrimary);
    expect(primaryImages).toHaveLength(1);
  });
});
