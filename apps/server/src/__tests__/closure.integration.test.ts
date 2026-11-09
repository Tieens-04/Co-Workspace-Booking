import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role, RoomStatus, BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { TestAccounts } from './support/test-accounts.js';

describe('Admin Closure API & Availability/Booking Blocking Integration Tests (MySQL)', () => {
  const accounts = new TestAccounts();
  beforeAll(() => accounts.persist());
  afterAll(() => accounts.cleanup());

  const testPrefix = `closure_test_${randomUUID().slice(0, 8)}`;
  const adminToken = accounts.token(Role.ADMIN, `admin_${randomUUID().slice(0, 8)}`);
  let customerToken: string;

  let testUserId: string;
  let testRoomAId: string;
  let testRoomBId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `${testPrefix}_customer@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Closure Test Customer',
        role: Role.CUSTOMER,
      },
    });
    testUserId = user.id;
    customerToken = accounts.token(Role.CUSTOMER, user.id);

    const roomA = await prisma.room.create({
      data: {
        name: `${testPrefix}_RoomA`,
        capacity: 10,
        pricePerHour: new Prisma.Decimal('100.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    testRoomAId = roomA.id;

    const roomB = await prisma.room.create({
      data: {
        name: `${testPrefix}_RoomB`,
        capacity: 20,
        pricePerHour: new Prisma.Decimal('200.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    testRoomBId = roomB.id;
  });

  afterAll(async () => {
    await prisma.closure.deleteMany({
      where: {
        OR: [
          { roomId: { in: [testRoomAId, testRoomBId] } },
          { reason: { contains: testPrefix } },
        ],
      },
    });
    await prisma.booking.deleteMany({
      where: {
        roomId: { in: [testRoomAId, testRoomBId] },
      },
    });
    await prisma.room.deleteMany({
      where: { id: { in: [testRoomAId, testRoomBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: testUserId },
    });
  });

  describe('1. Auth & RBAC Protection', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/admin/closures');
      expect(res.status).toBe(401);
    });

    it('rejects customer role with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/closures')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });

    it('rejects customer role when creating closure with 403', async () => {
      const res = await request(app)
        .post('/api/v1/admin/closures')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-12-25T08:00:00.000Z',
          endTime: '2026-12-25T18:00:00.000Z',
          reason: 'Christmas Holiday',
        });
      expect(res.status).toBe(403);
    });
  });

  describe('2. AC 1: CRUD Admin & Audit Trail', () => {
    let createdClosureId: string;

    it('creates a facility-wide closure and records AuditEvent', async () => {
      const res = await request(app)
        .post('/api/v1/admin/closures')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: null,
          startTime: '2026-12-25T01:00:00.000Z', // 08:00 VN
          endTime: '2026-12-25T11:00:00.000Z',   // 18:00 VN
          reason: `${testPrefix} Nghỉ lễ Giáng sinh toàn cơ sở`,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.roomId).toBeNull();
      expect(res.body.data.reason).toBe(`${testPrefix} Nghỉ lễ Giáng sinh toàn cơ sở`);
      createdClosureId = res.body.data.id;

      const audit = await prisma.auditEvent.findFirst({
        where: {
          entityType: 'CLOSURE',
          entityId: createdClosureId,
          action: 'CLOSURE_CREATED',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorRole).toBe(Role.ADMIN);
    });

    it('retrieves closure by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/closures/${createdClosureId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createdClosureId);
      expect(res.body.data.createdBy).toBeDefined();
    });

    it('updates closure and records AuditEvent', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/closures/${createdClosureId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: `${testPrefix} Nghỉ lễ Giáng sinh (Cập nhật)`,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.reason).toBe(`${testPrefix} Nghỉ lễ Giáng sinh (Cập nhật)`);

      const audit = await prisma.auditEvent.findFirst({
        where: {
          entityType: 'CLOSURE',
          entityId: createdClosureId,
          action: 'CLOSURE_UPDATED',
        },
      });
      expect(audit).not.toBeNull();
    });

    it('lists closures with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin/closures?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.some((c: { id: string }) => c.id === createdClosureId)).toBe(true);
    });

    it('deletes closure and records AuditEvent', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/closures/${createdClosureId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const audit = await prisma.auditEvent.findFirst({
        where: {
          entityType: 'CLOSURE',
          entityId: createdClosureId,
          action: 'CLOSURE_DELETED',
        },
      });
      expect(audit).not.toBeNull();

      // Verify deletion
      const check = await prisma.closure.findUnique({ where: { id: createdClosureId } });
      expect(check).toBeNull();
    });
  });

  describe('3. AC 3: Warning on Conflicting CONFIRMED Bookings', () => {
    const bookingStart = new Date('2026-11-20T03:00:00.000Z'); // 10:00 VN
    const bookingEnd = new Date('2026-11-20T05:00:00.000Z');   // 12:00 VN
    let conflictingBookingCode: string;

    beforeAll(async () => {
      conflictingBookingCode = `CS-20261120-${randomUUID().slice(0, 4).toUpperCase()}`;
      await prisma.booking.create({
        data: {
          bookingCode: conflictingBookingCode,
          userId: testUserId,
          roomId: testRoomAId,
          startTime: bookingStart,
          endTime: bookingEnd,
          totalAmount: new Prisma.Decimal('200.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });
    });

    it('rejects closure creation with 409 CLOSURE_HAS_CONFLICTING_BOOKINGS without cancel when not acknowledged', async () => {
      const res = await request(app)
        .post('/api/v1/admin/closures')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoomAId,
          startTime: '2026-11-20T02:00:00.000Z', // 09:00 VN
          endTime: '2026-11-20T06:00:00.000Z',   // 13:00 VN
          reason: `${testPrefix} Sửa phòng đột xuất`,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CLOSURE_HAS_CONFLICTING_BOOKINGS');
      expect(res.body.details.conflictingBookingCount).toBe(1);
      expect(res.body.details.bookings[0].bookingCode).toBe(conflictingBookingCode);

      // Verify booking was NOT cancelled!
      const booking = await prisma.booking.findUnique({
        where: { bookingCode: conflictingBookingCode },
      });
      expect(booking?.status).toBe(BookingStatus.CONFIRMED);
    });

    it('creates closure when acknowledgeConflictingBookings is true without cancelling bookings', async () => {
      const res = await request(app)
        .post('/api/v1/admin/closures')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoomAId,
          startTime: '2026-11-20T02:00:00.000Z',
          endTime: '2026-11-20T06:00:00.000Z',
          reason: `${testPrefix} Sửa phòng đột xuất`,
          acknowledgeConflictingBookings: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify booking is still CONFIRMED
      const booking = await prisma.booking.findUnique({
        where: { bookingCode: conflictingBookingCode },
      });
      expect(booking?.status).toBe(BookingStatus.CONFIRMED);
    });
  });

  describe('4. AC 2: Availability Endpoint Reflects CLOSED with Reason', () => {
    it('returns CLOSED for slots covered by closure in GET /rooms/:id/availability', async () => {
      const res = await request(app).get(`/api/v1/rooms/${testRoomAId}/availability?date=2026-11-20`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const slots = res.body.data.slots;
      const closedSlots = slots.filter((s: { status: string; reason?: string }) => s.status === 'CLOSED');
      // From 02:00 UTC to 06:00 UTC = 4 hours = 8 half-hour slots
      expect(closedSlots.length).toBe(8);
      expect(closedSlots[0].reason).toContain('Sửa phòng đột xuất');
    });
  });

  describe('5. AC 2 & AC 5: Booking Creation & Reschedule Blocking in Transaction', () => {
    // Closure is active on testRoomAId from 2026-11-20 02:00 UTC to 06:00 UTC (09:00 - 13:00 VN)
    // Local time anchor for validation: 2026-11-20 00:00 UTC
    it('blocks booking creation inside closure with 409 ROOM_CLOSED', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: testRoomAId,
          startTime: '2026-11-20T02:00:00.000Z', // 09:00 VN
          endTime: '2026-11-20T04:00:00.000Z',   // 11:00 VN
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_CLOSED');
      expect(res.body.details.reason).toContain('Sửa phòng đột xuất');
    });

    it('blocks partial overlap (starts before closure, ends inside) with 409 ROOM_CLOSED', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: testRoomAId,
          startTime: '2026-11-20T01:00:00.000Z', // 08:00 VN
          endTime: '2026-11-20T03:00:00.000Z',   // 10:00 VN (overlaps 02:00-03:00)
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_CLOSED');
    });

    it('blocks partial overlap (starts inside closure, ends after) with 409 ROOM_CLOSED', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: testRoomAId,
          startTime: '2026-11-20T05:00:00.000Z', // 12:00 VN
          endTime: '2026-11-20T07:00:00.000Z',   // 14:00 VN (overlaps 05:00-06:00)
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_CLOSED');
    });

    it('allows boundary touching: booking ends exactly when closure starts', async () => {
      // 07:00 to 09:00 VN (00:00 to 02:00 UTC)
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: testRoomAId,
          startTime: '2026-11-20T00:00:00.000Z',
          endTime: '2026-11-20T02:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('allows boundary touching: booking starts exactly when closure ends', async () => {
      // 13:00 to 15:00 VN (06:00 to 08:00 UTC)
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: testRoomAId,
          startTime: '2026-11-20T06:00:00.000Z',
          endTime: '2026-11-20T08:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('allows booking on Room B when closure is specific to Room A', async () => {
      // 09:00 to 11:00 VN on Room B
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          roomId: testRoomBId,
          startTime: '2026-11-20T02:00:00.000Z',
          endTime: '2026-11-20T04:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('blocks walk-in guest booking inside closure with 409 ROOM_CLOSED', async () => {
      const res = await request(app)
        .post('/api/v1/admin/bookings/guest')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoomAId,
          guestName: 'Walk-in Guest',
          guestPhone: '0987654321',
          startTime: '2026-11-20T03:00:00.000Z',
          endTime: '2026-11-20T05:00:00.000Z',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_CLOSED');
    });

    it('blocks reschedule into closed slot with 409 ROOM_CLOSED', async () => {
      // Create a valid booking at 14:00-16:00 UTC (21:00-23:00 VN)
      const validBooking = await prisma.booking.create({
        data: {
          bookingCode: `CS-20261120-${randomUUID().slice(0, 4).toUpperCase()}`,
          userId: testUserId,
          roomId: testRoomAId,
          startTime: new Date('2026-11-20T10:00:00.000Z'),
          endTime: new Date('2026-11-20T12:00:00.000Z'),
          totalAmount: new Prisma.Decimal('200.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });

      // Try to reschedule into 02:00-04:00 UTC (closed slot)
      const res = await request(app)
        .patch(`/api/v1/bookings/${validBooking.id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          startTime: '2026-11-20T02:00:00.000Z',
          endTime: '2026-11-20T04:00:00.000Z',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ROOM_CLOSED');
    });

    it('facility-wide closure (roomId: null) blocks booking creation, guest booking, reschedule, and marks availability slots CLOSED on all rooms', async () => {
      const user2 = await prisma.user.create({
        data: {
          email: `${testPrefix}_customer2@example.com`,
          passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
          fullName: 'Closure Test Customer 2',
          role: Role.CUSTOMER,
        },
      });
      const customer2Token = accounts.token(Role.CUSTOMER, user2.id);

      try {
        // Create facility-wide closure on 2026-11-21 02:00-05:00 UTC (09:00-12:00 VN)
        const createClosureRes = await request(app)
          .post('/api/v1/admin/closures')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            roomId: null,
            startTime: '2026-11-21T02:00:00.000Z',
            endTime: '2026-11-21T05:00:00.000Z',
            reason: `${testPrefix} Khử khuẩn toàn cơ sở`,
          });
        expect(createClosureRes.status).toBe(201);

        // 1. Availability on Room B reflects CLOSED
        const availRes = await request(app).get(
          `/api/v1/rooms/${testRoomBId}/availability?date=2026-11-21`,
        );
        expect(availRes.status).toBe(200);
        const closedSlots = availRes.body.data.slots.filter(
          (s: { status: string }) => s.status === 'CLOSED',
        );
        expect(closedSlots).toHaveLength(6); // 3 hours = 6 slots
        expect(closedSlots[0].reason).toContain('Khử khuẩn toàn cơ sở');

        // 2. Customer booking on Room B is blocked with 409 ROOM_CLOSED
        const bookRes = await request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${customer2Token}`)
          .send({
            roomId: testRoomBId,
            startTime: '2026-11-21T02:00:00.000Z',
            endTime: '2026-11-21T04:00:00.000Z',
          });
        expect(bookRes.status).toBe(409);
        expect(bookRes.body.code).toBe('ROOM_CLOSED');

        // 3. Admin guest booking on Room B is blocked with 409 ROOM_CLOSED
        const guestRes = await request(app)
          .post('/api/v1/admin/bookings/guest')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            roomId: testRoomBId,
            guestName: 'Guest Facility Closure',
            guestPhone: '0911223344',
            startTime: '2026-11-21T03:00:00.000Z',
            endTime: '2026-11-21T05:00:00.000Z',
          });
        expect(guestRes.status).toBe(409);
        expect(guestRes.body.code).toBe('ROOM_CLOSED');

        // 4. Reschedule into facility-wide closure on Room B is blocked with 409 ROOM_CLOSED
        const openBooking = await prisma.booking.create({
          data: {
            bookingCode: `CS-20261121-${randomUUID().slice(0, 4).toUpperCase()}`,
            userId: user2.id,
            roomId: testRoomBId,
            startTime: new Date('2026-11-21T07:00:00.000Z'),
            endTime: new Date('2026-11-21T09:00:00.000Z'),
            totalAmount: new Prisma.Decimal('400.00'),
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.UNPAID,
          },
        });
        const reschedRes = await request(app)
          .patch(`/api/v1/bookings/${openBooking.id}`)
          .set('Authorization', `Bearer ${customer2Token}`)
          .send({
            startTime: '2026-11-21T02:00:00.000Z',
            endTime: '2026-11-21T04:00:00.000Z',
          });
        expect(reschedRes.status).toBe(409);
        expect(reschedRes.body.code).toBe('ROOM_CLOSED');
      } finally {
        await prisma.booking.deleteMany({ where: { userId: user2.id } });
        await prisma.user.deleteMany({ where: { id: user2.id } });
      }
    });
  });

  describe('6. Filter, Validation, Audit & Dashboard Schedule Regression Tests', () => {
    it('does not return past closures when both upcoming=true and a past from parameter are provided', async () => {
      const pastClosure = await prisma.closure.create({
        data: {
          roomId: testRoomAId,
          startTime: new Date('2025-01-10T01:00:00.000Z'),
          endTime: new Date('2025-01-10T05:00:00.000Z'),
          reason: `${testPrefix} Past closure`,
          createdById: testUserId,
        },
      });

      const res = await request(app)
        .get(
          `/api/v1/admin/closures?roomId=${testRoomAId}&upcoming=true&from=2025-01-01T00:00:00.000Z`,
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.items.some((c: { id: string }) => c.id === pastClosure.id),
      ).toBe(false);
    });

    it('skips CLOSURE_UPDATED audit event when PATCH payload does not change any field and returns details on single-bound time violation', async () => {
      const createdRes = await request(app)
        .post('/api/v1/admin/closures')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoomBId,
          startTime: '2026-11-22T02:00:00.000Z',
          endTime: '2026-11-22T05:00:00.000Z',
          reason: `${testPrefix} No-op test`,
        });
      expect(createdRes.status).toBe(201);
      const closureId = createdRes.body.data.id;

      // 1. Update with identical reason -> 200 OK, 0 CLOSURE_UPDATED events
      const noopRes = await request(app)
        .patch(`/api/v1/admin/closures/${closureId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: `${testPrefix} No-op test` });
      expect(noopRes.status).toBe(200);

      const updateAudits = await prisma.auditEvent.count({
        where: {
          entityType: 'CLOSURE',
          entityId: closureId,
          action: 'CLOSURE_UPDATED',
        },
      });
      expect(updateAudits).toBe(0);

      // 2. Single-bound update where endTime <= existing.startTime -> 400 with field details
      const invalidTimeRes = await request(app)
        .patch(`/api/v1/admin/closures/${closureId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ endTime: '2026-11-22T01:00:00.000Z' });
      expect(invalidTimeRes.status).toBe(400);
      expect(invalidTimeRes.body.code).toBe('VALIDATION_ERROR');
      expect(invalidTimeRes.body.details).toEqual([
        { field: 'endTime', message: 'Thời gian kết thúc phải sau thời gian bắt đầu' },
      ]);
    });

    it('includes CLOSED slots on GET /api/v1/admin/dashboard/schedule when room or facility is closed', async () => {
      // On 2026-11-20, testRoomAId has a closure from 02:00 to 06:00 UTC (09:00-13:00 VN)
      const res = await request(app)
        .get('/api/v1/admin/dashboard/schedule?date=2026-11-20&limit=50')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const roomASchedule = res.body.data.rooms.find(
        (r: { id: string }) => r.id === testRoomAId,
      );
      expect(roomASchedule).toBeDefined();
      const closedSlots = roomASchedule.slots.filter(
        (s: { status: string }) => s.status === 'CLOSED',
      );
      expect(closedSlots).toHaveLength(8);
    });

    it('serializes concurrent closure creation and customer booking on the same room so both cannot succeed without conflict warning', async () => {
      const userConc = await prisma.user.create({
        data: {
          email: `${testPrefix}_conc@example.com`,
          passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
          fullName: 'Concurrency Customer',
          role: Role.CUSTOMER,
        },
      });
      const concToken = accounts.token(Role.CUSTOMER, userConc.id);

      try {
        // Fire both requests concurrently on 2026-11-23 02:00-04:00 UTC on testRoomBId
        const [bookingRes, closureRes] = await Promise.all([
          request(app)
            .post('/api/v1/bookings')
            .set('Authorization', `Bearer ${concToken}`)
            .send({
              roomId: testRoomBId,
              startTime: '2026-11-23T02:00:00.000Z',
              endTime: '2026-11-23T04:00:00.000Z',
            }),
          request(app)
            .post('/api/v1/admin/closures')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              roomId: testRoomBId,
              startTime: '2026-11-23T02:00:00.000Z',
              endTime: '2026-11-23T04:00:00.000Z',
              reason: `${testPrefix} Concurrent closure`,
              acknowledgeConflictingBookings: false,
            }),
        ]);

        // Exactly one must succeed (201) and the other must be rejected with 409
        const statuses = [bookingRes.status, closureRes.status].sort();
        expect(statuses).toEqual([201, 409]);

        if (bookingRes.status === 409) {
          expect(bookingRes.body.code).toBe('ROOM_CLOSED');
        } else {
          expect(closureRes.body.code).toBe('CLOSURE_HAS_CONFLICTING_BOOKINGS');
        }
      } finally {
        await prisma.booking.deleteMany({ where: { userId: userConc.id } });
        await prisma.user.deleteMany({ where: { id: userConc.id } });
      }
    });
  });
});
