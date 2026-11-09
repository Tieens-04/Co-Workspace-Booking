import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role, RoomStatus, BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { TestAccounts } from './support/test-accounts.js';
import { roomRepository } from '../repositories/room.repository.js';
import { generateToken } from '../utils/jwt.util.js';

describe('Admin Room API Integration Tests (Real MySQL Database & Transactions)', () => {
  const accounts = new TestAccounts();
  beforeAll(() => accounts.persist());
  afterAll(() => accounts.cleanup());

  const testPrefix = `test_admin_${randomUUID()}`;
  const adminToken = accounts.token(Role.ADMIN, `admin_${randomUUID()}`);

  let amenity1Id: string;
  let amenity2Id: string;
  let createdRoomId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test user for bookings
    const user = await prisma.user.create({
      data: {
        email: `${testPrefix}_user@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Test Booking Customer',
        role: Role.CUSTOMER,
      },
    });
    testUserId = user.id;

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
    await prisma.booking.deleteMany({
      where: { room: { name: { startsWith: testPrefix } } },
    });
    await prisma.room.deleteMany({
      where: { name: { startsWith: testPrefix } },
    });

    if (testUserId) {
      await prisma.booking.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.user.deleteMany({
        where: { id: testUserId },
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

    it('rejects creating room with pricePerHour <= 0', async () => {
      for (const invalidPrice of [0, '0', '0.00', -50, '-10.00']) {
        const res = await request(app)
          .post('/api/v1/admin/rooms')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: `${testPrefix}_Zero_Price_${randomUUID()}`,
            capacity: 4,
            pricePerHour: invalidPrice,
          });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects creating room with duplicate name (case-insensitive, trimmed)', async () => {
      const duplicateRes = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `  ${testPrefix.toUpperCase()}_ROOM_MAIN  `,
          capacity: 4,
          pricePerHour: '150.00',
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.code).toBe('ROOM_NAME_CONFLICT');
      expect(duplicateRes.body.message).toBe('Tên phòng đã tồn tại');
      expect(duplicateRes.body.details).toEqual([{ field: 'name', message: 'Tên phòng đã tồn tại' }]);
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

    it('rejects updating room with pricePerHour <= 0', async () => {
      for (const invalidPrice of [0, '0', '0.00', -20]) {
        const res = await request(app)
          .patch(`/api/v1/admin/rooms/${createdRoomId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ pricePerHour: invalidPrice });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects updating room name to an existing room name (case-insensitive, trimmed)', async () => {
      const secondRoomRes = await request(app)
        .post('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `${testPrefix}_Second_Room`,
          capacity: 6,
          pricePerHour: '200.00',
        });
      expect(secondRoomRes.status).toBe(201);
      const secondRoomId = secondRoomRes.body.data.id;

      const conflictRes = await request(app)
        .patch(`/api/v1/admin/rooms/${secondRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `  ${testPrefix.toUpperCase()}_ROOM_MAIN_UPDATED  `,
        });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.code).toBe('ROOM_NAME_CONFLICT');
      expect(conflictRes.body.message).toBe('Tên phòng đã tồn tại');
      expect(conflictRes.body.details).toEqual([{ field: 'name', message: 'Tên phòng đã tồn tại' }]);

      // Updating room without changing name succeeds
      const keepNameRes = await request(app)
        .patch(`/api/v1/admin/rooms/${secondRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `${testPrefix}_Second_Room`,
          capacity: 8,
        });
      expect(keepNameRes.status).toBe(200);
      expect(keepNameRes.body.data.capacity).toBe(8);
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

  describe('Maintenance warning time boundaries (CWB-52)', () => {
    const now = new Date('2026-12-01T03:00:00.000Z');
    const hour = 60 * 60 * 1000;
    let roomId: string;
    let timedAdminToken: string;

    beforeEach(async () => {
      const room = await prisma.room.create({
        data: {
          name: `${testPrefix}_Boundary_${randomUUID()}`,
          capacity: 4,
          pricePerHour: new Prisma.Decimal('100.00'),
          status: RoomStatus.AVAILABLE,
        },
      });
      roomId = room.id;
      vi.useFakeTimers({ toFake: ['Date'], now });
      timedAdminToken = await accounts.create(Role.ADMIN);
    });

    afterEach(async () => {
      vi.useRealTimers();
      if (roomId) {
        await prisma.booking.deleteMany({ where: { roomId } });
        await prisma.room.deleteMany({ where: { id: roomId } });
      }
    });

    const createBooking = (status: BookingStatus, startOffset: number, endOffset: number) =>
      prisma.booking.create({
        data: {
          bookingCode: `CS-20261201-${randomUUID()}`,
          roomId,
          userId: testUserId,
          startTime: new Date(now.getTime() + startOffset * hour),
          endTime: new Date(now.getTime() + endOffset * hour),
          totalAmount: new Prisma.Decimal('100.00'),
          status,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

    it('lists ongoing, starting-now, and future bookings and preserves them after acknowledgement', async () => {
      const affected = await Promise.all([
        createBooking(BookingStatus.CONFIRMED, -1, 1),
        createBooking(BookingStatus.CONFIRMED, 0, 2),
        createBooking(BookingStatus.CONFIRMED, 3, 4),
      ]);
      const excluded = await Promise.all([
        createBooking(BookingStatus.CONFIRMED, -1, 0),
        createBooking(BookingStatus.CANCELLED, 1, 2),
        createBooking(BookingStatus.COMPLETED, 1, 2),
        createBooking(BookingStatus.NO_SHOW, 1, 2),
      ]);
      const beforeBookings = await prisma.booking.findMany({
        where: { roomId },
        orderBy: { id: 'asc' },
      });

      const warning = await request(app)
        .patch(`/api/v1/admin/rooms/${roomId}`)
        .set('Authorization', `Bearer ${timedAdminToken}`)
        .send({ status: RoomStatus.MAINTENANCE });

      expect(warning.status).toBe(409);
      expect(warning.body.code).toBe('ROOM_HAS_FUTURE_BOOKINGS');
      expect(warning.body.details).toEqual({
        futureBookingCount: affected.length,
        bookings: affected.map((booking) => ({
          bookingCode: booking.bookingCode,
          startTime: booking.startTime.toISOString(),
          endTime: booking.endTime.toISOString(),
        })),
      });
      expect(await prisma.room.findUnique({ where: { id: roomId } })).toMatchObject({
        status: RoomStatus.AVAILABLE,
      });
      expect(await prisma.booking.count({ where: { roomId } })).toBe(
        affected.length + excluded.length,
      );

      const acknowledged = await request(app)
        .patch(`/api/v1/admin/rooms/${roomId}`)
        .set('Authorization', `Bearer ${timedAdminToken}`)
        .send({ status: RoomStatus.MAINTENANCE, acknowledgeFutureBookings: true });

      expect(acknowledged.status).toBe(200);
      expect(await prisma.room.findUnique({ where: { id: roomId } })).toMatchObject({
        status: RoomStatus.MAINTENANCE,
      });
      expect(await prisma.booking.findMany({ where: { roomId }, orderBy: { id: 'asc' } })).toEqual(
        beforeBookings,
      );
    });

    it.each([
      [BookingStatus.CONFIRMED, -1, 0],
      [BookingStatus.CANCELLED, -1, 1],
      [BookingStatus.COMPLETED, -1, 1],
      [BookingStatus.NO_SHOW, -1, 1],
      [BookingStatus.CANCELLED, 1, 2],
      [BookingStatus.COMPLETED, 1, 2],
      [BookingStatus.NO_SHOW, 1, 2],
    ])('allows maintenance for %s booking from now%sh to now%sh', async (status, start, end) => {
      const booking = await createBooking(status, start, end);

      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${roomId}`)
        .set('Authorization', `Bearer ${timedAdminToken}`)
        .send({ status: RoomStatus.MAINTENANCE });

      expect(res.status).toBe(200);
      expect(await prisma.room.findUnique({ where: { id: roomId } })).toMatchObject({
        status: RoomStatus.MAINTENANCE,
      });
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toEqual(booking);
    });
  });

  describe('Room Status & Maintenance Warning Integration (AC1)', () => {
    it('updates status from AVAILABLE to MAINTENANCE directly when no future bookings exist', async () => {
      // Ensure no bookings exist for this room
      await prisma.booking.deleteMany({ where: { roomId: createdRoomId } });

      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.MAINTENANCE });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(RoomStatus.MAINTENANCE);

      const dbRoom = await prisma.room.findUnique({ where: { id: createdRoomId } });
      expect(dbRoom!.status).toBe(RoomStatus.MAINTENANCE);

      // Switch back to AVAILABLE
      const resBack = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.AVAILABLE });

      expect(resBack.status).toBe(200);
      expect(resBack.body.data.status).toBe(RoomStatus.AVAILABLE);

      const dbRoomBack = await prisma.room.findUnique({ where: { id: createdRoomId } });
      expect(dbRoomBack!.status).toBe(RoomStatus.AVAILABLE);
    });

    it('warns with 409 ROOM_HAS_FUTURE_BOOKINGS when future CONFIRMED booking exists, rolls back, and does not mutate booking', async () => {
      const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const futureEnd = new Date(Date.now() + 26 * 60 * 60 * 1000);
      const testCode = `CS-20261201-${randomUUID().slice(0, 4).toUpperCase()}`;

      const booking = await prisma.booking.create({
        data: {
          bookingCode: testCode,
          roomId: createdRoomId,
          userId: testUserId,
          startTime: futureStart,
          endTime: futureEnd,
          totalAmount: new Prisma.Decimal('250.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      // 1. Attempt to set MAINTENANCE without acknowledgement
      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.MAINTENANCE });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ROOM_HAS_FUTURE_BOOKINGS');
      expect(res.body.details).toBeDefined();
      expect(res.body.details.futureBookingCount).toBe(1);
      expect(res.body.details.bookings[0].bookingCode).toBe(testCode);

      // Verify DB: room status is STILL AVAILABLE (rolled back)
      const dbRoom = await prisma.room.findUnique({ where: { id: createdRoomId } });
      expect(dbRoom!.status).toBe(RoomStatus.AVAILABLE);

      // Verify DB: booking is STILL CONFIRMED (never auto-cancelled)
      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking!.status).toBe(BookingStatus.CONFIRMED);
    });

    it('completes transition to MAINTENANCE when acknowledgeFutureBookings is true, and booking remains CONFIRMED', async () => {
      // Ensure room is AVAILABLE and create a self-contained future booking fixture
      await prisma.room.update({
        where: { id: createdRoomId },
        data: { status: RoomStatus.AVAILABLE },
      });

      const futureStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const futureEnd = new Date(Date.now() + 50 * 60 * 60 * 1000);
      const testCode = `CS-20261203-${randomUUID().slice(0, 4).toUpperCase()}`;

      const existingBooking = await prisma.booking.create({
        data: {
          bookingCode: testCode,
          roomId: createdRoomId,
          userId: testUserId,
          startTime: futureStart,
          endTime: futureEnd,
          totalAmount: new Prisma.Decimal('250.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      // Retry with explicit acknowledgement
      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.MAINTENANCE, acknowledgeFutureBookings: true });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(RoomStatus.MAINTENANCE);

      // Verify DB: room is now MAINTENANCE
      const dbRoom = await prisma.room.findUnique({ where: { id: createdRoomId } });
      expect(dbRoom!.status).toBe(RoomStatus.MAINTENANCE);

      // Verify DB: booking is STILL CONFIRMED
      const dbBooking = await prisma.booking.findUnique({ where: { id: existingBooking.id } });
      expect(dbBooking!.status).toBe(BookingStatus.CONFIRMED);
    });

    it('is idempotent when already in MAINTENANCE status', async () => {
      // Room is currently MAINTENANCE, send MAINTENANCE again without acknowledgement
      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.MAINTENANCE });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(RoomStatus.MAINTENANCE);
    });

    it('rolls back metadata changes when future booking warning triggers', async () => {
      // Switch room back to AVAILABLE first
      await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.AVAILABLE });

      const beforeRoom = await prisma.room.findUnique({ where: { id: createdRoomId } });
      const originalName = beforeRoom!.name;

      // Attempt combined update of name + status without acknowledgement
      const res = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `${testPrefix}_Uncommitted_Name`,
          status: RoomStatus.MAINTENANCE,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_HAS_FUTURE_BOOKINGS');

      // Verify DB: name was rolled back and status is still AVAILABLE
      const afterRoom = await prisma.room.findUnique({ where: { id: createdRoomId } });
      expect(afterRoom!.name).toBe(originalName);
      expect(afterRoom!.status).toBe(RoomStatus.AVAILABLE);
    });
  });

  describe('Room Archiving & Unarchiving Integration (CWB-85: AC1, AC2, AC3, AC4)', () => {
    it('archives room, records status history & audit event, hides from public, and unarchives', async () => {
      // 1. Ensure room is clean of bookings and in AVAILABLE status
      await prisma.booking.deleteMany({ where: { roomId: createdRoomId } });
      await prisma.room.update({
        where: { id: createdRoomId },
        data: { status: RoomStatus.AVAILABLE },
      });

      // 2. Admin archives the room without future bookings (AC1)
      const archiveRes = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.ARCHIVED });

      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.data.status).toBe(RoomStatus.ARCHIVED);

      // Verify DB status
      const archivedDbRoom = await prisma.room.findUnique({ where: { id: createdRoomId } });
      expect(archivedDbRoom!.status).toBe(RoomStatus.ARCHIVED);

      // Verify RoomStatusHistory recorded (AC1)
      const history = await prisma.roomStatusHistory.findMany({
        where: { roomId: createdRoomId },
        orderBy: { effectiveAt: 'desc' },
      });
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].status).toBe(RoomStatus.ARCHIVED);

      // Verify AuditEvent recorded (AC1)
      const auditEvents = await prisma.auditEvent.findMany({
        where: { entityId: createdRoomId, action: 'ROOM_STATUS_CHANGED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditEvents.length).toBeGreaterThan(0);
      expect((auditEvents[0].after as any).status).toBe(RoomStatus.ARCHIVED);

      // 3. Public access verification (AC2)
      // Hidden from public GET /api/v1/rooms
      const publicListRes = await request(app).get('/api/v1/rooms');
      expect(publicListRes.status).toBe(200);
      const publicItem = publicListRes.body.data.items.find(
        (r: { id: string }) => r.id === createdRoomId,
      );
      expect(publicItem).toBeUndefined();

      // Public GET /api/v1/rooms/:id returns 404
      const publicDetailRes = await request(app).get(`/api/v1/rooms/${createdRoomId}`);
      expect(publicDetailRes.status).toBe(404);
      expect(publicDetailRes.body.code).toBe('ROOM_NOT_FOUND');

      // Public GET /api/v1/rooms/:id/availability returns 404
      const publicAvailRes = await request(app).get(
        `/api/v1/rooms/${createdRoomId}/availability?date=2026-12-10`,
      );
      expect(publicAvailRes.status).toBe(404);
      expect(publicAvailRes.body.code).toBe('ROOM_NOT_FOUND');

      // Booking into ARCHIVED room is rejected (Customer)
      const customerToken = generateToken({ sub: testUserId, role: Role.CUSTOMER });
      const bookRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: createdRoomId,
          startTime: '2026-12-10T09:00:00.000+07:00',
          endTime: '2026-12-10T11:00:00.000+07:00',
        });
      expect(bookRes.status).toBe(409);
      expect(bookRes.body.code).toBe('ROOM_NOT_AVAILABLE');

      // Guest booking into ARCHIVED room is also rejected
      const guestBookRes = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: createdRoomId,
          guestName: 'Walk-in Guest',
          guestPhone: '0912345678',
          startTime: '2026-12-10T09:00:00.000+07:00',
          endTime: '2026-12-10T11:00:00.000+07:00',
        });
      expect(guestBookRes.status).toBe(409);
      expect(guestBookRes.body.code).toBe('ROOM_NOT_AVAILABLE');

      // Admin can list archived rooms with status filter (AC2)
      const adminListRes = await request(app)
        .get('/api/v1/admin/rooms?status=ARCHIVED')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminListRes.status).toBe(200);
      const adminItem = adminListRes.body.data.items.find(
        (r: { id: string }) => r.id === createdRoomId,
      );
      expect(adminItem).toBeDefined();

      // Admin can view details of ARCHIVED room via GET /api/v1/admin/rooms/:id (AC4)
      const adminDetailRes = await request(app)
        .get(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminDetailRes.status).toBe(200);
      expect(adminDetailRes.body.data.id).toBe(createdRoomId);
      expect(adminDetailRes.body.data.status).toBe(RoomStatus.ARCHIVED);

      // 4. Admin unarchives the room back to AVAILABLE (AC4)
      const unarchiveRes = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.AVAILABLE });

      expect(unarchiveRes.status).toBe(200);
      expect(unarchiveRes.body.data.status).toBe(RoomStatus.AVAILABLE);

      const unarchivedDbRoom = await prisma.room.findUnique({ where: { id: createdRoomId } });
      expect(unarchivedDbRoom!.status).toBe(RoomStatus.AVAILABLE);
    });

    it('handles future booking conflict when archiving room (AC3)', async () => {
      // 1. Reset to AVAILABLE
      await prisma.room.update({
        where: { id: createdRoomId },
        data: { status: RoomStatus.AVAILABLE },
      });

      // 2. Create a future CONFIRMED booking
      const futureStart = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const futureEnd = new Date(Date.now() + 74 * 60 * 60 * 1000);
      const testCode = `CS-20261205-${randomUUID().slice(0, 4).toUpperCase()}`;

      const booking = await prisma.booking.create({
        data: {
          bookingCode: testCode,
          roomId: createdRoomId,
          userId: testUserId,
          startTime: futureStart,
          endTime: futureEnd,
          totalAmount: new Prisma.Decimal('360.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      // 3. Attempt to archive without acknowledgement -> 409 ROOM_HAS_FUTURE_BOOKINGS
      const conflictRes = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.ARCHIVED });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.code).toBe('ROOM_HAS_FUTURE_BOOKINGS');
      expect(conflictRes.body.details.futureBookingCount).toBe(1);
      expect(conflictRes.body.details.bookings[0].bookingCode).toBe(testCode);

      // Verify room status unchanged
      const roomCheck = await prisma.room.findUnique({ where: { id: createdRoomId } });
      expect(roomCheck!.status).toBe(RoomStatus.AVAILABLE);

      // 4. Archive with acknowledgeFutureBookings: true -> 200, booking preserved
      const ackRes = await request(app)
        .patch(`/api/v1/admin/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RoomStatus.ARCHIVED, acknowledgeFutureBookings: true });

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.status).toBe(RoomStatus.ARCHIVED);

      // Verify booking is still CONFIRMED
      const bookingCheck = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(bookingCheck!.status).toBe(BookingStatus.CONFIRMED);

      // 5. Customer cannot reschedule booking of ARCHIVED room (Finding 3 Regression)
      const customerToken = generateToken({ sub: testUserId, role: Role.CUSTOMER });
      const newStart = new Date(futureStart.getTime() + 24 * 60 * 60 * 1000);
      newStart.setUTCHours(2, 0, 0, 0); // 09:00 VN
      const newEnd = new Date(newStart.getTime() + 2 * 60 * 60 * 1000);

      const rescheduleRes = await request(app)
        .patch(`/api/v1/bookings/${booking.id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
        });
      expect(rescheduleRes.status).toBe(409);
      expect(rescheduleRes.body.code).toBe('ROOM_NOT_AVAILABLE');
      expect(rescheduleRes.body.message).toContain('Phòng đã ngừng kinh doanh');

      // 6. Booking of ARCHIVED room is preserved in customer booking history (AC2, AC6)
      const customerHistoryRes = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(customerHistoryRes.status).toBe(200);
      const foundInCustomerHistory = customerHistoryRes.body.data.items.find(
        (b: { id: string }) => b.id === booking.id,
      );
      expect(foundInCustomerHistory).toBeDefined();
      expect(foundInCustomerHistory.bookingCode).toBe(testCode);
      expect(foundInCustomerHistory.room.id).toBe(createdRoomId);

      // 7. Booking of ARCHIVED room is preserved in admin booking list (AC6)
      const adminBookingsRes = await request(app)
        .get(`/api/v1/admin/bookings?bookingCode=${testCode}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminBookingsRes.status).toBe(200);
      expect(adminBookingsRes.body.data.items).toHaveLength(1);
      expect(adminBookingsRes.body.data.items[0].id).toBe(booking.id);
      expect(adminBookingsRes.body.data.items[0].room.id).toBe(createdRoomId);

      // 8. Room and its bookings appear in admin revenue endpoint (AC6)
      const revenueRes = await request(app)
        .get(`/api/v1/admin/revenue?roomId=${createdRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(revenueRes.status).toBe(200);
      expect(revenueRes.body.success).toBe(true);
      expect(revenueRes.body.data).toHaveProperty('actualRevenue');
      expect(revenueRes.body.data).toHaveProperty('potentialRevenue');

      // 9. Booking of ARCHIVED room appears in admin CSV export (AC6)
      const dateStr = futureStart.toISOString().slice(0, 10);
      const csvRes = await request(app)
        .get(
          `/api/v1/admin/reports/bookings.csv?startDate=${dateStr}&endDate=${dateStr}&roomId=${createdRoomId}`,
        )
        .set('Authorization', `Bearer ${adminToken}`);
      expect(csvRes.status).toBe(200);
      expect(csvRes.headers['content-type']).toContain('text/csv');
      expect(csvRes.text).toContain(testCode);

      // 10. Filter combining status=ARCHIVED with time slot returns 0 rooms (Finding 2 Regression)
      const slotFilterRes = await request(app)
        .get('/api/v1/admin/rooms?status=ARCHIVED&date=2026-12-10&startTime=09:00&endTime=11:00')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(slotFilterRes.status).toBe(200);
      expect(slotFilterRes.body.data.items).toHaveLength(0);

      // Clean up booking
      await prisma.booking.delete({ where: { id: booking.id } });
    });
  });
});
