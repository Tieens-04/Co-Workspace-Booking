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
        emailVerifiedAt: new Date(),
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
        OR: [{ roomId: { in: [testRoomAId, testRoomBId] } }, { reason: { contains: testPrefix } }],
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
          endTime: '2026-12-25T11:00:00.000Z', // 18:00 VN
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
    const bookingEnd = new Date('2026-11-20T05:00:00.000Z'); // 12:00 VN
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
          endTime: '2026-11-20T06:00:00.000Z', // 13:00 VN
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
      const res = await request(app).get(
        `/api/v1/rooms/${testRoomAId}/availability?date=2026-11-20`,
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const slots = res.body.data.slots;
      const closedSlots = slots.filter(
        (s: { status: string; reason?: string }) => s.status === 'CLOSED',
      );
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
          endTime: '2026-11-20T04:00:00.000Z', // 11:00 VN
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
          endTime: '2026-11-20T03:00:00.000Z', // 10:00 VN (overlaps 02:00-03:00)
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
          endTime: '2026-11-20T07:00:00.000Z', // 14:00 VN (overlaps 05:00-06:00)
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
          emailVerifiedAt: new Date(),
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
      expect(res.body.data.items.some((c: { id: string }) => c.id === pastClosure.id)).toBe(false);
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

      // 1. Update with identical reason (including surrounding whitespace) -> 200 OK, full DTO, 0 CLOSURE_UPDATED events
      const noopRes = await request(app)
        .patch(`/api/v1/admin/closures/${closureId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoomBId,
          startTime: '2026-11-22T02:00:00.000Z',
          endTime: '2026-11-22T05:00:00.000Z',
          reason: `  ${testPrefix} No-op test  `,
        });
      expect(noopRes.status).toBe(200);
      expect(noopRes.body.data).toMatchObject({
        id: closureId,
        roomId: testRoomBId,
        room: { id: testRoomBId, name: `${testPrefix}_RoomB` },
        reason: `${testPrefix} No-op test`,
        createdBy: {
          id: createdRes.body.data.createdById,
          fullName: 'Integration ADMIN',
        },
        updatedAt: createdRes.body.data.updatedAt,
      });

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
      const roomASchedule = res.body.data.rooms.find((r: { id: string }) => r.id === testRoomAId);
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
          emailVerifiedAt: new Date(),
        },
      });
      const concToken = accounts.token(Role.CUSTOMER, userConc.id);

      try {
        // Fire both requests concurrently on 2026-11-23 02:00-04:00 UTC on testRoomBId
        const [bookingRes, closureRes] = await Promise.all([
          request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${concToken}`).send({
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

    const DAY_MS = 24 * 60 * 60 * 1000;
    function futureUtcSlot(
      daysAhead: number,
      startHourUtc: number,
      endHourUtc: number,
    ): { startTime: string; endTime: string; dateCompact: string } {
      const day = new Date(Date.now() + daysAhead * DAY_MS);
      const start = new Date(day);
      start.setUTCHours(startHourUtc, 0, 0, 0);
      const end = new Date(day);
      end.setUTCHours(endHourUtc, 0, 0, 0);
      return {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        dateCompact: start.toISOString().slice(0, 10).replace(/-/g, ''),
      };
    }

    it('CWB-109: detects a concurrent booking committed while PATCH /api/v1/admin/closures/:id waits on the room lock under REPEATABLE READ', async () => {
      async function waitForRowLocked(
        probe: () => Promise<unknown>,
        label: string,
        timeoutMs = 3000,
      ): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          try {
            await probe();
          } catch (err) {
            const msg = String(err);
            if (msg.includes('3572') || msg.toLowerCase().includes('nowait')) {
              return;
            }
            throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
        throw new Error(`Timed out waiting for row lock: ${label}`);
      }

      const initialSlot = futureUtcSlot(10, 8, 10);
      const contestedSlot = futureUtcSlot(10, 2, 4);
      const dummySlot = futureUtcSlot(10, 12, 14);

      const localAccounts = new TestAccounts();
      const raceUserId = randomUUID();
      let raceRoomId: string | undefined;
      let closureId: string | undefined;
      const pending: Array<Promise<unknown>> = [];

      let releaseBlocker!: () => void;
      const blockerGate = new Promise<void>((resolve) => {
        releaseBlocker = resolve;
      });
      let markBlockerArmed!: () => void;
      const blockerArmed = new Promise<void>((resolve) => {
        markBlockerArmed = resolve;
      });

      try {
        const raceToken = await localAccounts.create(Role.CUSTOMER, raceUserId);
        const raceRoom = await prisma.room.create({
          data: {
            name: `${testPrefix}_MVCCRaceRoom`,
            capacity: 8,
            pricePerHour: new Prisma.Decimal('150.00'),
            status: RoomStatus.AVAILABLE,
          },
        });
        raceRoomId = raceRoom.id;

        const idemKey = `mvcc_race_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
        const dummyBooking = await prisma.booking.create({
          data: {
            bookingCode: `CS-${dummySlot.dateCompact}-${randomUUID().slice(0, 4).toUpperCase()}`,
            userId: raceUserId,
            roomId: testRoomAId,
            startTime: new Date(dummySlot.startTime),
            endTime: new Date(dummySlot.endTime),
            totalAmount: new Prisma.Decimal('200.00'),
            status: BookingStatus.CANCELLED,
            paymentStatus: PaymentStatus.UNPAID,
            idempotencyScope: `user:${raceUserId}`,
            idempotencyKey: idemKey,
            idempotencyHash: '0'.repeat(64),
          },
        });

        const createClosureRes = await request(app)
          .post('/api/v1/admin/closures')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            roomId: raceRoom.id,
            startTime: initialSlot.startTime,
            endTime: initialSlot.endTime,
            reason: `${testPrefix} MVCC race initial slot`,
          });
        expect(createClosureRes.status).toBe(201);
        closureId = createClosureRes.body.data.id as string;

        // Hold an X lock on (idempotency_scope, idempotency_key) so POST /api/v1/bookings pauses
        // immediately after locking `raceRoom` FOR UPDATE, before inserting its CONFIRMED row.
        const blockerTx = prisma.$transaction(
          async (tx) => {
            await tx.booking.delete({ where: { id: dummyBooking.id } });
            markBlockerArmed();
            await blockerGate;
          },
          { timeout: 10000 },
        );
        void blockerTx.catch(() => {});
        pending.push(blockerTx);
        await blockerArmed;

        const bookingPromise = request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${raceToken}`)
          .set('Idempotency-Key', idemKey)
          .send({
            roomId: raceRoom.id,
            startTime: contestedSlot.startTime,
            endTime: contestedSlot.endTime,
          })
          .then((res) => res);
        void bookingPromise.catch(() => {});
        pending.push(bookingPromise);

        await waitForRowLocked(
          () =>
            prisma.$queryRaw(
              Prisma.sql`SELECT id FROM rooms WHERE id = ${raceRoom.id} FOR UPDATE NOWAIT`,
            ),
          'raceRoom locked by POST /api/v1/bookings',
        );

        const patchPromise = request(app)
          .patch(`/api/v1/admin/closures/${closureId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            startTime: contestedSlot.startTime,
            endTime: contestedSlot.endTime,
            acknowledgeConflictingBookings: false,
          })
          .then((res) => res);
        void patchPromise.catch(() => {});
        pending.push(patchPromise);

        await waitForRowLocked(
          () =>
            prisma.$queryRaw(
              Prisma.sql`SELECT id FROM closures WHERE id = ${closureId} FOR UPDATE NOWAIT`,
            ),
          'closure locked by PATCH /api/v1/admin/closures/:id',
        );
        // Allow PATCH to advance past any pre-room-lock query and block on `lockTargetRooms`.
        await new Promise((resolve) => setTimeout(resolve, 40));

        releaseBlocker();
        const [, bookingRes, patchRes] = await Promise.all([
          blockerTx,
          bookingPromise,
          patchPromise,
        ]);

        expect(bookingRes.status).toBe(201);
        expect(patchRes.status).toBe(409);
        expect(patchRes.body.code).toBe('CLOSURE_HAS_CONFLICTING_BOOKINGS');
        expect(patchRes.body.details.conflictingBookingCount).toBe(1);
        expect(patchRes.body.details.bookings[0].bookingCode).toBe(
          bookingRes.body.data.bookingCode,
        );

        const persistedClosure = await prisma.closure.findUnique({ where: { id: closureId } });
        expect(persistedClosure?.startTime.toISOString()).toBe(initialSlot.startTime);
        expect(persistedClosure?.endTime.toISOString()).toBe(initialSlot.endTime);

        const updateAudits = await prisma.auditEvent.count({
          where: {
            entityType: 'CLOSURE',
            entityId: closureId,
            action: 'CLOSURE_UPDATED',
          },
        });
        expect(updateAudits).toBe(0);
      } finally {
        releaseBlocker();
        await Promise.allSettled(pending);
        if (closureId) {
          await prisma.closure.deleteMany({ where: { id: closureId } });
        }
        await prisma.booking.deleteMany({
          where: {
            OR: [{ userId: raceUserId }, ...(raceRoomId ? [{ roomId: raceRoomId }] : [])],
          },
        });
        if (raceRoomId) {
          await prisma.room.deleteMany({ where: { id: raceRoomId } });
        }
        await localAccounts.cleanup();
      }
    });

    it('CWB-109: serializes concurrent PATCH /api/v1/admin/closures/:id (time shift and facility-wide expansion) against POST /api/v1/bookings', async () => {
      const shiftInitialSlot = futureUtcSlot(11, 8, 10);
      const shiftContestedSlot = futureUtcSlot(11, 2, 4);
      const facilityContestedSlot = futureUtcSlot(12, 2, 4);

      const localAccounts = new TestAccounts();
      const parUserId = randomUUID();
      const pending: Array<Promise<unknown>> = [];
      let shiftClosureId: string | undefined;
      let facilityClosureId: string | undefined;

      try {
        const parToken = await localAccounts.create(Role.CUSTOMER, parUserId);

        // Case A: Shifting an existing room closure into a concurrently booked slot
        const createdShift = await request(app)
          .post('/api/v1/admin/closures')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            roomId: testRoomBId,
            startTime: shiftInitialSlot.startTime,
            endTime: shiftInitialSlot.endTime,
            reason: `${testPrefix} Shift closure`,
          });
        expect(createdShift.status).toBe(201);
        shiftClosureId = createdShift.body.data.id as string;

        const shiftBookingReq = request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${parToken}`)
          .send({
            roomId: testRoomBId,
            startTime: shiftContestedSlot.startTime,
            endTime: shiftContestedSlot.endTime,
          })
          .then((res) => res);
        void shiftBookingReq.catch(() => {});
        const shiftPatchReq = request(app)
          .patch(`/api/v1/admin/closures/${shiftClosureId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            startTime: shiftContestedSlot.startTime,
            endTime: shiftContestedSlot.endTime,
            acknowledgeConflictingBookings: false,
          })
          .then((res) => res);
        void shiftPatchReq.catch(() => {});
        pending.push(shiftBookingReq, shiftPatchReq);

        const [shiftBookingRes, shiftPatchRes] = await Promise.all([
          shiftBookingReq,
          shiftPatchReq,
        ]);

        if (shiftBookingRes.status === 201) {
          expect(shiftPatchRes.status).toBe(409);
          expect(shiftPatchRes.body.code).toBe('CLOSURE_HAS_CONFLICTING_BOOKINGS');
        } else {
          expect(shiftBookingRes.status).toBe(409);
          expect(shiftBookingRes.body.code).toBe('ROOM_CLOSED');
          expect(shiftPatchRes.status).toBe(200);
        }

        // Case B: Expanding a Room A closure into a facility-wide closure (roomId: null) while Room B is booked
        const createdFacility = await request(app)
          .post('/api/v1/admin/closures')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            roomId: testRoomAId,
            startTime: facilityContestedSlot.startTime,
            endTime: facilityContestedSlot.endTime,
            reason: `${testPrefix} Expand to facility closure`,
          });
        expect(createdFacility.status).toBe(201);
        facilityClosureId = createdFacility.body.data.id as string;

        const facilityBookingReq = request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${parToken}`)
          .send({
            roomId: testRoomBId,
            startTime: facilityContestedSlot.startTime,
            endTime: facilityContestedSlot.endTime,
          })
          .then((res) => res);
        void facilityBookingReq.catch(() => {});
        const facilityPatchReq = request(app)
          .patch(`/api/v1/admin/closures/${facilityClosureId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            roomId: null,
            acknowledgeConflictingBookings: false,
          })
          .then((res) => res);
        void facilityPatchReq.catch(() => {});
        pending.push(facilityBookingReq, facilityPatchReq);

        const [facilityBookingRes, facilityPatchRes] = await Promise.all([
          facilityBookingReq,
          facilityPatchReq,
        ]);

        if (facilityBookingRes.status === 201) {
          expect(facilityPatchRes.status).toBe(409);
          expect(facilityPatchRes.body.code).toBe('CLOSURE_HAS_CONFLICTING_BOOKINGS');
        } else {
          expect(facilityBookingRes.status).toBe(409);
          expect(facilityBookingRes.body.code).toBe('ROOM_CLOSED');
          expect(facilityPatchRes.status).toBe(200);
        }
      } finally {
        await Promise.allSettled(pending);
        const ids = [shiftClosureId, facilityClosureId].filter((id): id is string => Boolean(id));
        if (ids.length > 0) {
          await prisma.closure.deleteMany({ where: { id: { in: ids } } });
        }
        await prisma.booking.deleteMany({ where: { userId: parUserId } });
        await localAccounts.cleanup();
      }
    });
  });
});
