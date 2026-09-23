import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role, RoomStatus, BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import * as bookingCodeUtil from '../utils/booking-code.util.js';

describe('Booking API Integration Tests (Real MySQL Database & Transactions)', () => {
  const testPrefix = `test_booking_${randomUUID()}`;

  let testUserId: string;
  let customerToken: string;
  let testUser2Id: string;
  let customer2Token: string;
  let adminToken: string;

  let availableRoomId: string;
  let maintenanceRoomId: string;

  beforeAll(async () => {
    // Create customer 1
    const user1 = await prisma.user.create({
      data: {
        email: `${testPrefix}_user1@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Customer One',
        role: Role.CUSTOMER,
      },
    });
    testUserId = user1.id;
    customerToken = generateToken({ sub: testUserId, role: Role.CUSTOMER });

    // Create customer 2
    const user2 = await prisma.user.create({
      data: {
        email: `${testPrefix}_user2@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Customer Two',
        role: Role.CUSTOMER,
      },
    });
    testUser2Id = user2.id;
    customer2Token = generateToken({ sub: testUser2Id, role: Role.CUSTOMER });

    // Admin token
    adminToken = generateToken({ sub: `admin_${randomUUID()}`, role: Role.ADMIN });

    // Create an AVAILABLE room
    const room1 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Available_Room`,
        capacity: 6,
        pricePerHour: new Prisma.Decimal('150.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    availableRoomId = room1.id;

    // Create a MAINTENANCE room
    const room2 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Maintenance_Room`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('120.00'),
        status: RoomStatus.MAINTENANCE,
      },
    });
    maintenanceRoomId = room2.id;
  });

  afterAll(async () => {
    // Delete in FK order: bookings -> rooms -> users
    await prisma.booking.deleteMany({
      where: { roomId: { in: [availableRoomId, maintenanceRoomId] } },
    });

    await prisma.room.deleteMany({
      where: { id: { in: [availableRoomId, maintenanceRoomId] } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, testUser2Id] } },
    });

    await prisma.$disconnect();
  });

  describe('Happy path: create booking & pricing calculation', () => {
    it('creates booking with server price total, confirmed/unpaid defaults, and returns 201', async () => {
      // 1.5 hours duration (90 mins), starting tomorrow at 09:00 UTC
      const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 90 * 60 * 1000); // 1.5h

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          note: 'Họp chiến lược Q3',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      const expectedDateSegment = bookingCodeUtil.getBookingDateSegment(start);
      expect(res.body.data.bookingCode).toMatch(
        new RegExp(`^CS-${expectedDateSegment}-[A-Z0-9]{4}$`),
      );
      expect(res.body.data.room.id).toBe(availableRoomId);
      // 150.00 * 1.5 = 225.00
      expect(res.body.data.totalAmount).toBe('225.00');
      expect(res.body.data.status).toBe(BookingStatus.CONFIRMED);
      expect(res.body.data.paymentStatus).toBe(PaymentStatus.UNPAID);
      expect(res.body.data.paymentMethod).toBeNull();
      expect(res.body.data.note).toBe('Họp chiến lược Q3');

      // Verify directly in DB
      const dbBooking = await prisma.booking.findUnique({
        where: { id: res.body.data.id },
      });
      expect(dbBooking).not.toBeNull();
      expect(dbBooking!.userId).toBe(testUserId);
      expect(dbBooking!.roomId).toBe(availableRoomId);
      expect(dbBooking!.bookingCode).toBe(res.body.data.bookingCode);
      expect(dbBooking!.bookingCode).toMatch(
        new RegExp(`^CS-${expectedDateSegment}-[A-Z0-9]{4}$`),
      );
      expect(dbBooking!.totalAmount.toFixed(2)).toBe('225.00');
      expect(dbBooking!.status).toBe(BookingStatus.CONFIRMED);
      expect(dbBooking!.paymentStatus).toBe(PaymentStatus.UNPAID);
      expect(dbBooking!.paymentMethod).toBeNull();
      expect(dbBooking!.note).toBe('Họp chiến lược Q3');
    });

    it('handles fractional price per hour and rounds total with ROUND_HALF_UP in DB and API response', async () => {
      // Create room with fractional price 100.55
      const fractionalRoom = await prisma.room.create({
        data: {
          name: `${testPrefix}_Fractional_Room`,
          capacity: 2,
          pricePerHour: new Prisma.Decimal('100.55'),
          status: RoomStatus.AVAILABLE,
        },
      });

      // 1.5 hours duration (90 mins): 100.55 * 1.5 = 150.825 -> 150.83
      const start = new Date(Date.now() + 52 * 60 * 60 * 1000);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 90 * 60 * 1000);

      try {
        const res = await request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            roomId: fractionalRoom.id,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          });

        expect(res.status).toBe(201);
        expect(res.body.data.totalAmount).toBe('150.83');

        const dbBooking = await prisma.booking.findUnique({
          where: { id: res.body.data.id },
        });
        expect(dbBooking).not.toBeNull();
        expect(dbBooking!.totalAmount.toFixed(2)).toBe('150.83');
      } finally {
        await prisma.booking.deleteMany({ where: { roomId: fractionalRoom.id } });
        await prisma.room.deleteMany({ where: { id: fractionalRoom.id } });
      }
    });
  });

  describe('AC2: Maintenance Room Blocking', () => {
    it('rejects booking on MAINTENANCE room with 409 ROOM_NOT_AVAILABLE and inserts zero rows', async () => {
      const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const beforeCount = await prisma.booking.count({
        where: { roomId: maintenanceRoomId },
      });

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: maintenanceRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');

      const afterCount = await prisma.booking.count({
        where: { roomId: maintenanceRoomId },
      });
      expect(afterCount).toBe(beforeCount);
    });
  });

  describe('Overlap Rules & Boundary Touching', () => {
    let baseStart: Date;
    let baseEnd: Date;

    beforeAll(async () => {
      // Create a confirmed anchor booking: Day after tomorrow 10:00 to 12:00 UTC
      baseStart = new Date(Date.now() + 96 * 60 * 60 * 1000);
      baseStart.setUTCHours(10, 0, 0, 0);
      baseEnd = new Date(baseStart.getTime() + 2 * 60 * 60 * 1000); // 12:00

      await prisma.booking.create({
        data: {
          bookingCode: `CS-20261201-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: baseStart,
          endTime: baseEnd,
          totalAmount: new Prisma.Decimal('300.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });
    });

    it('rejects partial overlap (11:00 - 13:00)', async () => {
      const start = new Date(baseStart.getTime() + 60 * 60 * 1000); // 11:00
      const end = new Date(baseEnd.getTime() + 60 * 60 * 1000); // 13:00

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
    });

    it('rejects requested booking fully inside existing (10:30 - 11:30)', async () => {
      const start = new Date(baseStart.getTime() + 30 * 60 * 1000); // 10:30
      const end = new Date(baseEnd.getTime() - 30 * 60 * 1000); // 11:30

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
    });

    it('rejects requested booking enclosing existing (09:00 - 13:00)', async () => {
      const start = new Date(baseStart.getTime() - 60 * 60 * 1000); // 09:00
      const end = new Date(baseEnd.getTime() + 60 * 60 * 1000); // 13:00

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_CONFLICT');
    });

    it('allows boundary touching after existing booking (12:00 - 14:00)', async () => {
      const start = new Date(baseEnd.getTime()); // exactly 12:00
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 14:00

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
    });

    it('allows boundary touching before existing booking (08:00 - 10:00)', async () => {
      const end = new Date(baseStart.getTime()); // exactly 10:00
      const start = new Date(end.getTime() - 2 * 60 * 60 * 1000); // 08:00

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: availableRoomId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
    });

    it('allows booking on a slot where previous booking was CANCELLED', async () => {
      const cancelStart = new Date(Date.now() + 120 * 60 * 60 * 1000);
      cancelStart.setUTCHours(14, 0, 0, 0);
      const cancelEnd = new Date(cancelStart.getTime() + 2 * 60 * 60 * 1000);

      // Create a CANCELLED booking
      await prisma.booking.create({
        data: {
          bookingCode: `CS-20261201-${randomUUID().slice(0, 4).toUpperCase()}`,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: cancelStart,
          endTime: cancelEnd,
          totalAmount: new Prisma.Decimal('300.00'),
          status: BookingStatus.CANCELLED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      // Customer books the exact same slot
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: availableRoomId,
          startTime: cancelStart.toISOString(),
          endTime: cancelEnd.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
    });
  });

  describe('Concurrency & Double-Booking Prevention', () => {
    it('prevents double-booking when two concurrent requests book the exact same slot', async () => {
      const slotStart = new Date(Date.now() + 144 * 60 * 60 * 1000);
      slotStart.setUTCHours(10, 0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000);

      const payload = {
        roomId: availableRoomId,
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
      };

      // Send both requests concurrently via Promise.all
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${customerToken}`)
          .send(payload),
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${customer2Token}`)
          .send(payload),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(conflictRes.body.code).toBe('BOOKING_CONFLICT');

      // Verify in DB: exactly 1 booking exists for this slot
      const count = await prisma.booking.count({
        where: {
          roomId: availableRoomId,
          startTime: slotStart,
          endTime: slotEnd,
          status: BookingStatus.CONFIRMED,
        },
      });
      expect(count).toBe(1);
    });

    it('serializes maintenance transition and booking creation safely', async () => {
      const slotStart = new Date(Date.now() + 168 * 60 * 60 * 1000);
      slotStart.setUTCHours(10, 0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000);

      // Create an isolated room for this race
      const isolatedRoom = await prisma.room.create({
        data: {
          name: `${testPrefix}_Race_Room`,
          capacity: 4,
          pricePerHour: new Prisma.Decimal('100.00'),
          status: RoomStatus.AVAILABLE,
        },
      });

      // Run unacknowledged maintenance transition and create booking simultaneously
      const [patchRes, postRes] = await Promise.all([
        request(app)
          .patch(`/api/v1/admin/rooms/${isolatedRoom.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: RoomStatus.MAINTENANCE }),
        request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${customerToken}`).send({
          roomId: isolatedRoom.id,
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
        }),
      ]);

      // If PATCH won: patch = 200, post = 409 (ROOM_NOT_AVAILABLE)
      // If POST won: post = 201, patch = 409 (ROOM_HAS_FUTURE_BOOKINGS)
      if (patchRes.status === 200) {
        expect(postRes.status).toBe(409);
        expect(postRes.body.code).toBe('ROOM_NOT_AVAILABLE');
      } else {
        expect(postRes.status).toBe(201);
        expect(patchRes.status).toBe(409);
        expect(patchRes.body.code).toBe('ROOM_HAS_FUTURE_BOOKINGS');
      }

      // Cleanup isolated room
      await prisma.booking.deleteMany({ where: { roomId: isolatedRoom.id } });
      await prisma.room.deleteMany({ where: { id: isolatedRoom.id } });
    });
  });

  describe('Booking Code Uniqueness & Database Collision Retry', () => {
    it('retries when candidate booking code collides with an existing DB record and succeeds with fresh code', async () => {
      const slotStart = new Date(Date.now() + 55 * 60 * 60 * 1000);
      slotStart.setUTCMinutes(0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

      // Pre-existing booking placed strictly after slotEnd with a safe gap (cannot overlap with slotStart..slotEnd)
      const preStart = new Date(slotEnd.getTime() + 60 * 60 * 1000);
      const preEnd = new Date(preStart.getTime() + 60 * 60 * 1000);

      const dateSegment = bookingCodeUtil.getBookingDateSegment(slotStart);
      const collisionCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;
      let uniqueCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;
      while (uniqueCode === collisionCode) {
        uniqueCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;
      }

      // Verify neither code exists in DB before test setup
      const existing = await prisma.booking.findFirst({
        where: { bookingCode: { in: [collisionCode, uniqueCode] } },
      });
      expect(existing).toBeNull();

      const beforeCount = await prisma.booking.count({
        where: { roomId: availableRoomId },
      });

      // Insert existing booking with collisionCode
      const preExisting = await prisma.booking.create({
        data: {
          bookingCode: collisionCode,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: preStart,
          endTime: preEnd,
          totalAmount: new Prisma.Decimal('150.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      let createdBookingId: string | undefined;
      const codeSpy = vi
        .spyOn(bookingCodeUtil, 'generateBookingCode')
        .mockReturnValueOnce(collisionCode)
        .mockReturnValueOnce(uniqueCode);

      try {
        const res = await request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            roomId: availableRoomId,
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
          });

        expect(res.status).toBe(201);
        createdBookingId = res.body.data?.id;
        expect(createdBookingId).toBeDefined();
        expect(res.body.data.bookingCode).toBe(uniqueCode);
        expect(codeSpy).toHaveBeenCalledTimes(2);

        // Verify pre-existing booking is intact
        const verifyPreExisting = await prisma.booking.findUnique({
          where: { id: preExisting.id },
        });
        expect(verifyPreExisting).not.toBeNull();
        expect(verifyPreExisting!.bookingCode).toBe(collisionCode);

        // Verify new booking persisted with uniqueCode
        const verifyNewBooking = await prisma.booking.findUnique({
          where: { id: createdBookingId! },
        });
        expect(verifyNewBooking).not.toBeNull();
        expect(verifyNewBooking!.bookingCode).toBe(uniqueCode);

        // Verify record count increased by exactly 1
        const afterCount = await prisma.booking.count({
          where: { roomId: availableRoomId },
        });
        expect(afterCount).toBe(beforeCount + 2); // preExisting + 1 new booking
      } finally {
        codeSpy.mockRestore();
        const idsToDelete = [preExisting.id];
        if (createdBookingId) {
          idsToDelete.push(createdBookingId);
        }
        await prisma.booking.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }
    });

    it('returns 409 BOOKING_CODE_CONFLICT when all 5 code attempts collide and creates zero new rows', async () => {
      const slotStart = new Date(Date.now() + 58 * 60 * 60 * 1000);
      slotStart.setUTCMinutes(0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

      // Pre-existing booking placed strictly after slotEnd with a safe gap
      const preStart = new Date(slotEnd.getTime() + 60 * 60 * 1000);
      const preEnd = new Date(preStart.getTime() + 60 * 60 * 1000);

      const dateSegment = bookingCodeUtil.getBookingDateSegment(slotStart);
      const collisionCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;

      // Verify code does not exist in DB before test setup
      const existing = await prisma.booking.findUnique({
        where: { bookingCode: collisionCode },
      });
      expect(existing).toBeNull();

      const beforeCount = await prisma.booking.count({
        where: { roomId: availableRoomId },
      });

      const preExisting = await prisma.booking.create({
        data: {
          bookingCode: collisionCode,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: preStart,
          endTime: preEnd,
          totalAmount: new Prisma.Decimal('150.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      const codeSpy = vi
        .spyOn(bookingCodeUtil, 'generateBookingCode')
        .mockReturnValue(collisionCode);

      try {
        const res = await request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            roomId: availableRoomId,
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
          });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('BOOKING_CODE_CONFLICT');
        expect(res.body.message).toBe('Không thể tạo mã đặt phòng duy nhất, vui lòng thử lại');
        expect(res.body.details).toBeUndefined();
        expect(codeSpy).toHaveBeenCalledTimes(5);

        // Exactly zero new booking rows were created
        const afterCount = await prisma.booking.count({
          where: { roomId: availableRoomId },
        });
        expect(afterCount).toBe(beforeCount + 1); // only preExisting
      } finally {
        codeSpy.mockRestore();
        await prisma.booking.deleteMany({
          where: { id: preExisting.id },
        });
      }
    });

    it('ensures cleanup is strictly isolated by ID and never deletes unrelated bookings with colliding codes (Finding 1 Regression)', async () => {
      const slotStart = new Date(Date.now() + 62 * 60 * 60 * 1000);
      slotStart.setUTCMinutes(0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
      const preStart = new Date(slotEnd.getTime() + 60 * 60 * 1000);
      const preEnd = new Date(preStart.getTime() + 60 * 60 * 1000);

      const dateSegment = bookingCodeUtil.getBookingDateSegment(slotStart);
      const unrelatedCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;
      let uniqueCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;
      while (uniqueCode === unrelatedCode) {
        uniqueCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;
      }

      // Verify neither code exists in DB before test setup
      const existing = await prisma.booking.findFirst({
        where: { bookingCode: { in: [unrelatedCode, uniqueCode] } },
      });
      expect(existing).toBeNull();

      // Create an unrelated pre-existing booking
      const unrelatedBooking = await prisma.booking.create({
        data: {
          bookingCode: unrelatedCode,
          roomId: availableRoomId,
          userId: testUserId,
          startTime: preStart,
          endTime: preEnd,
          totalAmount: new Prisma.Decimal('150.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      let createdBookingId: string | undefined;
      const codeSpy = vi
        .spyOn(bookingCodeUtil, 'generateBookingCode')
        .mockReturnValueOnce(unrelatedCode) // collides with unrelatedBooking
        .mockReturnValueOnce(uniqueCode);

      try {
        const res = await request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            roomId: availableRoomId,
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
          });

        expect(res.status).toBe(201);
        createdBookingId = res.body.data?.id;
        expect(createdBookingId).toBeDefined();
        expect(res.body.data.bookingCode).toBe(uniqueCode);
        expect(codeSpy).toHaveBeenCalledTimes(2);

        // Perform cleanup of the new booking by ID only
        await prisma.booking.deleteMany({
          where: { id: createdBookingId },
        });

        // Verify the unrelated booking was NOT deleted
        const stillExists = await prisma.booking.findUnique({
          where: { id: unrelatedBooking.id },
        });
        expect(stillExists).not.toBeNull();
        expect(stillExists!.bookingCode).toBe(unrelatedCode);
      } finally {
        codeSpy.mockRestore();
        await prisma.booking.deleteMany({
          where: { id: { in: [unrelatedBooking.id, createdBookingId].filter(Boolean) as string[] } },
        });
      }
    });

    it('ensures fixture slot and pre-existing collision booking never overlap even at the critical 2026-11-29T19:00:00Z timestamp (Finding 2 Regression)', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-29T19:00:00.000Z') });
      try {
        const timedCustomerToken = generateToken({ sub: testUserId, role: Role.CUSTOMER });
        const slotStart = new Date(Date.now() + 55 * 60 * 60 * 1000);
        slotStart.setUTCMinutes(0, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
        const preStart = new Date(slotEnd.getTime() + 60 * 60 * 1000);
        const preEnd = new Date(preStart.getTime() + 60 * 60 * 1000);

        // Verify slotStart is 2026-12-02T02:00:00.000Z (the exact timestamp reported in review-01)
        expect(slotStart.toISOString()).toBe('2026-12-02T02:00:00.000Z');
        // Verify preStart is after slotEnd (2026-12-02T04:00:00.000Z), so no overlap
        expect(preStart.toISOString()).toBe('2026-12-02T04:00:00.000Z');

        const dateSegment = bookingCodeUtil.getBookingDateSegment(slotStart);
        const collisionCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;
        let uniqueCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;
        while (uniqueCode === collisionCode) {
          uniqueCode = `CS-${dateSegment}-${randomUUID().slice(0, 4).toUpperCase()}`;
        }

        // Verify neither code exists in DB before test setup
        const existing = await prisma.booking.findFirst({
          where: { bookingCode: { in: [collisionCode, uniqueCode] } },
        });
        expect(existing).toBeNull();

        const preExisting = await prisma.booking.create({
          data: {
            bookingCode: collisionCode,
            roomId: availableRoomId,
            userId: testUserId,
            startTime: preStart,
            endTime: preEnd,
            totalAmount: new Prisma.Decimal('150.00'),
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.UNPAID,
          },
        });

        let createdBookingId: string | undefined;
        const codeSpy = vi
          .spyOn(bookingCodeUtil, 'generateBookingCode')
          .mockReturnValueOnce(collisionCode)
          .mockReturnValueOnce(uniqueCode);

        try {
          const res = await request(app)
            .post('/api/v1/bookings')
            .set('Authorization', `Bearer ${timedCustomerToken}`)
            .send({
              roomId: availableRoomId,
              startTime: slotStart.toISOString(),
              endTime: slotEnd.toISOString(),
            });

          // Must be 201 (NOT 409 BOOKING_CONFLICT)
          expect(res.status).toBe(201);
          createdBookingId = res.body.data?.id;
          expect(res.body.data.bookingCode).toBe(uniqueCode);
          expect(codeSpy).toHaveBeenCalledTimes(2);
        } finally {
          codeSpy.mockRestore();
          const idsToDelete = [preExisting.id];
          if (createdBookingId) {
            idsToDelete.push(createdBookingId);
          }
          await prisma.booking.deleteMany({
            where: { id: { in: idsToDelete } },
          });
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
