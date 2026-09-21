import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role, RoomStatus, BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';

describe('Room Availability Integration Tests (Real MySQL Database)', () => {
  const testPrefix = `test_avail_${randomUUID()}`;

  let testUserId: string;
  let customerToken: string;
  let testUser2Id: string;
  let customer2Token: string;

  let testRoomId: string;
  let otherRoomId: string;
  let maintenanceRoomId: string;
  let staleRoomId: string;

  // We test with date '2026-10-15' (Vietnam time)
  // Day start: 2026-10-15 00:00:00 +07:00 = 2026-10-14 17:00:00.000Z
  // Day end:   2026-10-16 00:00:00 +07:00 = 2026-10-15 17:00:00.000Z
  const testDate = '2026-10-15';

  beforeAll(async () => {
    // 1. Create test customers
    const user1 = await prisma.user.create({
      data: {
        email: `${testPrefix}_user1@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Test Customer One',
        role: Role.CUSTOMER,
      },
    });
    testUserId = user1.id;
    customerToken = generateToken({ sub: testUserId, role: Role.CUSTOMER });

    const user2 = await prisma.user.create({
      data: {
        email: `${testPrefix}_user2@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Test Customer Two',
        role: Role.CUSTOMER,
      },
    });
    testUser2Id = user2.id;
    customer2Token = generateToken({ sub: testUser2Id, role: Role.CUSTOMER });

    // 2. Create test rooms
    const room1 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Available_Room`,
        capacity: 8,
        pricePerHour: new Prisma.Decimal('100.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    testRoomId = room1.id;

    const room2 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Other_Room`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('80.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    otherRoomId = room2.id;

    const room3 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Maintenance_Room`,
        capacity: 6,
        pricePerHour: new Prisma.Decimal('120.00'),
        status: RoomStatus.MAINTENANCE,
      },
    });
    maintenanceRoomId = room3.id;

    const room4 = await prisma.room.create({
      data: {
        name: `${testPrefix}_Stale_Scenario_Room`,
        capacity: 10,
        pricePerHour: new Prisma.Decimal('150.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    staleRoomId = room4.id;

    // 3. Create existing bookings in MySQL to test availability query
    // Booking A on testRoom: 10:00 - 12:00 VN (03:00 - 05:00 UTC) -> CONFIRMED, UNPAID (blocks)
    await prisma.booking.create({
      data: {
        bookingCode: `CS-20261015-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: testUserId,
        roomId: testRoomId,
        startTime: new Date('2026-10-15T03:00:00.000Z'),
        endTime: new Date('2026-10-15T05:00:00.000Z'),
        totalAmount: new Prisma.Decimal('200.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    // Booking B on testRoom: 14:00 - 16:00 VN (07:00 - 09:00 UTC) -> CONFIRMED, PAID (blocks)
    await prisma.booking.create({
      data: {
        bookingCode: `CS-20261015-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: testUserId,
        roomId: testRoomId,
        startTime: new Date('2026-10-15T07:00:00.000Z'),
        endTime: new Date('2026-10-15T09:00:00.000Z'),
        totalAmount: new Prisma.Decimal('200.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
      },
    });

    // Booking C on otherRoom: 10:00 - 12:00 VN (03:00 - 05:00 UTC) -> CONFIRMED (must not affect testRoom)
    await prisma.booking.create({
      data: {
        bookingCode: `CS-20261015-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: testUserId,
        roomId: otherRoomId,
        startTime: new Date('2026-10-15T03:00:00.000Z'),
        endTime: new Date('2026-10-15T05:00:00.000Z'),
        totalAmount: new Prisma.Decimal('160.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    // Booking D on testRoom: 12:00 - 14:00 VN (05:00 - 07:00 UTC) -> CANCELLED (must not block)
    await prisma.booking.create({
      data: {
        bookingCode: `CS-20261015-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: testUserId,
        roomId: testRoomId,
        startTime: new Date('2026-10-15T05:00:00.000Z'),
        endTime: new Date('2026-10-15T07:00:00.000Z'),
        totalAmount: new Prisma.Decimal('200.00'),
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    // Booking E on testRoom: 16:00 - 18:00 VN (09:00 - 11:00 UTC) -> COMPLETED (must not block)
    await prisma.booking.create({
      data: {
        bookingCode: `CS-20261015-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: testUserId,
        roomId: testRoomId,
        startTime: new Date('2026-10-15T09:00:00.000Z'),
        endTime: new Date('2026-10-15T11:00:00.000Z'),
        totalAmount: new Prisma.Decimal('200.00'),
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
      },
    });

    // Booking F on testRoom: 18:00 - 20:00 VN (11:00 - 13:00 UTC) -> NO_SHOW (must not block)
    await prisma.booking.create({
      data: {
        bookingCode: `CS-20261015-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: testUserId,
        roomId: testRoomId,
        startTime: new Date('2026-10-15T11:00:00.000Z'),
        endTime: new Date('2026-10-15T13:00:00.000Z'),
        totalAmount: new Prisma.Decimal('200.00'),
        status: BookingStatus.NO_SHOW,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    // Booking G: Overnight booking starting from previous day 23:30 VN to 00:30 VN (16:30 - 17:30 UTC on Oct 14)
    await prisma.booking.create({
      data: {
        bookingCode: `CS-20261014-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: testUserId,
        roomId: testRoomId,
        startTime: new Date('2026-10-14T16:30:00.000Z'),
        endTime: new Date('2026-10-14T17:30:00.000Z'),
        totalAmount: new Prisma.Decimal('100.00'),
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
      },
    });
  });

  afterAll(async () => {
    // Delete in FK order: bookings -> rooms -> users
    await prisma.booking.deleteMany({
      where: { roomId: { in: [testRoomId, otherRoomId, maintenanceRoomId, staleRoomId] } },
    });

    await prisma.room.deleteMany({
      where: { id: { in: [testRoomId, otherRoomId, maintenanceRoomId, staleRoomId] } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, testUser2Id] } },
    });

    await prisma.$disconnect();
  });

  describe('Real MySQL Room Availability Filtering', () => {
    it('returns 48 slots with accurate occupancy from database bookings', async () => {
      const res = await request(app).get(`/api/v1/rooms/${testRoomId}/availability?date=${testDate}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slots).toHaveLength(48);

      const slots = res.body.data.slots;

      // 1. Overnight booking from previous day: slot 0 (00:00-00:30 VN = 17:00-17:30 UTC) is BOOKED
      expect(slots[0].startTime).toBe('2026-10-14T17:00:00.000Z');
      expect(slots[0].endTime).toBe('2026-10-14T17:30:00.000Z');
      expect(slots[0].status).toBe('BOOKED');

      // Slot 1 (00:30-01:00 VN) must be AVAILABLE
      expect(slots[1].status).toBe('AVAILABLE');

      // 2. Booking A (10:00-12:00 VN = 03:00-05:00 UTC) -> 4 slots BOOKED
      const morningBooked = slots.filter(
        (s: { startTime: string; endTime: string; status: string }) =>
          s.startTime >= '2026-10-15T03:00:00.000Z' && s.endTime <= '2026-10-15T05:00:00.000Z',
      );
      expect(morningBooked).toHaveLength(4);
      expect(morningBooked.every((s: { status: string }) => s.status === 'BOOKED')).toBe(true);

      // Boundary slot right before (09:30-10:00 VN = 02:30-03:00 UTC) is AVAILABLE
      const slotBeforeA = slots.find((s: { endTime: string }) => s.endTime === '2026-10-15T03:00:00.000Z');
      expect(slotBeforeA?.status).toBe('AVAILABLE');

      // Boundary slot right after: Booking D (12:00-14:00 VN) is CANCELLED -> slots must be AVAILABLE
      const cancelledSlots = slots.filter(
        (s: { startTime: string; endTime: string; status: string }) =>
          s.startTime >= '2026-10-15T05:00:00.000Z' && s.endTime <= '2026-10-15T07:00:00.000Z',
      );
      expect(cancelledSlots).toHaveLength(4);
      expect(cancelledSlots.every((s: { status: string }) => s.status === 'AVAILABLE')).toBe(true);

      // 3. Booking B (14:00-16:00 VN = 07:00-09:00 UTC) is CONFIRMED & PAID -> 4 slots BOOKED
      const afternoonBooked = slots.filter(
        (s: { startTime: string; endTime: string; status: string }) =>
          s.startTime >= '2026-10-15T07:00:00.000Z' && s.endTime <= '2026-10-15T09:00:00.000Z',
      );
      expect(afternoonBooked).toHaveLength(4);
      expect(afternoonBooked.every((s: { status: string }) => s.status === 'BOOKED')).toBe(true);

      // 4. Booking E (16:00-18:00 VN) is COMPLETED -> AVAILABLE
      const completedSlots = slots.filter(
        (s: { startTime: string; endTime: string; status: string }) =>
          s.startTime >= '2026-10-15T09:00:00.000Z' && s.endTime <= '2026-10-15T11:00:00.000Z',
      );
      expect(completedSlots).toHaveLength(4);
      expect(completedSlots.every((s: { status: string }) => s.status === 'AVAILABLE')).toBe(true);

      // 5. Booking F (18:00-20:00 VN) is NO_SHOW -> AVAILABLE
      const noShowSlots = slots.filter(
        (s: { startTime: string; endTime: string; status: string }) =>
          s.startTime >= '2026-10-15T11:00:00.000Z' && s.endTime <= '2026-10-15T13:00:00.000Z',
      );
      expect(noShowSlots).toHaveLength(4);
      expect(noShowSlots.every((s: { status: string }) => s.status === 'AVAILABLE')).toBe(true);
    });

    it('isolates bookings by room: other room bookings do not appear in availability', async () => {
      const res = await request(app).get(`/api/v1/rooms/${otherRoomId}/availability?date=${testDate}`);

      expect(res.status).toBe(200);
      const slots = res.body.data.slots;

      // otherRoom only has booking 10:00-12:00 (4 slots booked); slot 0 and afternoon slots must be AVAILABLE
      expect(slots[0].status).toBe('AVAILABLE');
      const booked = slots.filter((s: { status: string }) => s.status === 'BOOKED');
      expect(booked).toHaveLength(4);
    });

    it('returns 409 ROOM_NOT_AVAILABLE for maintenance room in database', async () => {
      const res = await request(app).get(
        `/api/v1/rooms/${maintenanceRoomId}/availability?date=${testDate}`,
      );

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
    });
  });

  describe('Stale Availability & TOCTOU Scenario (Read -> Write -> Conflicting Write)', () => {
    it('demonstrates availability becomes stale upon booking creation, and second booking is rejected with 409', async () => {
      // Dynamically calculate a future date and slot relative to now to guarantee lead time >= 30m
      // 3 days in future, at 03:00 UTC (10:00 Asia/Ho_Chi_Minh)
      const futureStart = new Date(Date.now() + 72 * 60 * 60 * 1000);
      futureStart.setUTCHours(3, 0, 0, 0);
      const futureEnd = new Date(futureStart.getTime() + 90 * 60 * 1000); // 1.5h duration (11:30 VN)

      const slotStartIso = futureStart.toISOString();
      const slotEndIso = futureEnd.toISOString();

      // Derive YYYY-MM-DD in Asia/Ho_Chi_Minh (+07:00)
      const futureDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(futureStart);

      // Step 1: Customer 1 checks availability -> slot is AVAILABLE
      const getRes1 = await request(app).get(
        `/api/v1/rooms/${staleRoomId}/availability?date=${futureDate}`,
      );
      expect(getRes1.status).toBe(200);
      const slotBefore = getRes1.body.data.slots.find(
        (s: { startTime: string }) => s.startTime === slotStartIso,
      );
      expect(slotBefore?.status).toBe('AVAILABLE');

      // Step 2: Customer 1 books the slot -> 201 Created
      const postRes1 = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: staleRoomId,
          startTime: slotStartIso,
          endTime: slotEndIso,
        });
      expect(postRes1.status).toBe(201);
      expect(postRes1.body.success).toBe(true);

      // Step 3: Check availability again -> slot is now BOOKED
      const getRes2 = await request(app).get(
        `/api/v1/rooms/${staleRoomId}/availability?date=${futureDate}`,
      );
      expect(getRes2.status).toBe(200);
      const slotAfter = getRes2.body.data.slots.find(
        (s: { startTime: string }) => s.startTime === slotStartIso,
      );
      expect(slotAfter?.status).toBe('BOOKED');

      // Step 4: Customer 2 attempts to book the same slot -> 409 BOOKING_CONFLICT
      const postRes2 = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({
          roomId: staleRoomId,
          startTime: slotStartIso,
          endTime: slotEndIso,
        });
      expect(postRes2.status).toBe(409);
      expect(postRes2.body.code).toBe('BOOKING_CONFLICT');
    });
  });
});
