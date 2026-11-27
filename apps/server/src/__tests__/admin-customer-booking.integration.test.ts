import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { TestAccounts } from './support/test-accounts.js';
import { hashPassword } from '../utils/password.util.js';
import { drainBackgroundTasks } from '../utils/background-tasks.util.js';
import { ENV } from '../config/env.config.js';

describe('Admin booking for existing customer (CWB-99, real MySQL)', () => {
  const defaultActiveLimit = ENV.BOOKING_MAX_ACTIVE_PER_CUSTOMER;
  const accounts = new TestAccounts();

  const tag = randomUUID().slice(0, 8);
  const adminId = `admin-${tag}`;
  const adminToken = accounts.token(Role.ADMIN, adminId);

  let roomId: string;
  let otherRoomId: string;
  let maintenanceRoomId: string;
  let customerId: string;
  let customerToken: string;
  let otherCustomerId: string;
  let otherCustomerToken: string;
  let capCustomerId: string;
  let lockedCustomerId: string;
  let unverifiedCustomerId: string;
  let deletedCustomerId: string;
  let adminAccountId: string;

  const createdUserIds: string[] = [];
  let dayOffset = 2;

  const nextSlot = (durationHours = 2) => {
    const base = new Date();
    base.setUTCHours(2, 0, 0, 0); // 09:00 VN
    const start = new Date(base.getTime() + dayOffset++ * 86_400_000);
    return {
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + durationHours * 3_600_000).toISOString(),
    };
  };

  const postForCustomer = (token: string, body: object, key?: string) => {
    const req = request(app).post('/api/v1/admin/bookings').set('Authorization', `Bearer ${token}`);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };

  beforeAll(async () => {
    await accounts.persist();
    ENV.BOOKING_MAX_ACTIVE_PER_CUSTOMER = 5;

    const [roomA, roomB, roomMaint] = await Promise.all([
      prisma.room.create({
        data: {
          name: `CWB99 Room A ${tag}`,
          capacity: 6,
          pricePerHour: new Prisma.Decimal('150000.00'),
          status: RoomStatus.AVAILABLE,
        },
      }),
      prisma.room.create({
        data: {
          name: `CWB99 Room B ${tag}`,
          capacity: 4,
          pricePerHour: new Prisma.Decimal('100000.00'),
          status: RoomStatus.AVAILABLE,
        },
      }),
      prisma.room.create({
        data: {
          name: `CWB99 Room Maint ${tag}`,
          capacity: 4,
          pricePerHour: new Prisma.Decimal('100000.00'),
          status: RoomStatus.MAINTENANCE,
        },
      }),
    ]);
    roomId = roomA.id;
    otherRoomId = roomB.id;
    maintenanceRoomId = roomMaint.id;

    const passwordHash = await hashPassword('Password123!');
    const [verified, secondVerified, capCustomer, locked, unverified, deleted, adminUser] =
      await Promise.all([
        prisma.user.create({
          data: {
            email: `cwb99_verified_${tag}@example.com`,
            passwordHash,
            fullName: 'Khách Quen Alpha',
            phoneNumber: '0901112233',
            role: Role.CUSTOMER,
            emailVerifiedAt: new Date(),
          },
        }),
        prisma.user.create({
          data: {
            email: `cwb99_second_${tag}@example.com`,
            passwordHash,
            fullName: 'Khách Quen Beta',
            phoneNumber: null,
            role: Role.CUSTOMER,
            emailVerifiedAt: new Date(),
          },
        }),
        prisma.user.create({
          data: {
            email: `cwb99_cap_${tag}@example.com`,
            passwordHash,
            fullName: 'Khách Quen Cap',
            phoneNumber: '0909998877',
            role: Role.CUSTOMER,
            emailVerifiedAt: new Date(),
          },
        }),
        prisma.user.create({
          data: {
            email: `cwb99_locked_${tag}@example.com`,
            passwordHash,
            fullName: 'Khách Bị Khóa',
            role: Role.CUSTOMER,
            emailVerifiedAt: new Date(),
            lockedAt: new Date(),
            lockReason: 'Vi phạm quy định',
          },
        }),
        prisma.user.create({
          data: {
            email: `cwb99_unverified_${tag}@example.com`,
            passwordHash,
            fullName: 'Khách Chưa Xác Thực',
            role: Role.CUSTOMER,
            emailVerifiedAt: null,
          },
        }),
        prisma.user.create({
          data: {
            email: `cwb99_deleted_${tag}@example.com`,
            passwordHash,
            fullName: 'Khách Đã Xóa',
            role: Role.CUSTOMER,
            emailVerifiedAt: new Date(),
            deletedAt: new Date(),
          },
        }),
        prisma.user.create({
          data: {
            email: `cwb99_admin_${tag}@example.com`,
            passwordHash,
            fullName: 'Admin Tài Khoản',
            role: Role.ADMIN,
            emailVerifiedAt: new Date(),
          },
        }),
      ]);

    customerId = verified.id;
    otherCustomerId = secondVerified.id;
    capCustomerId = capCustomer.id;
    lockedCustomerId = locked.id;
    unverifiedCustomerId = unverified.id;
    deletedCustomerId = deleted.id;
    adminAccountId = adminUser.id;
    createdUserIds.push(
      customerId,
      otherCustomerId,
      capCustomerId,
      lockedCustomerId,
      unverifiedCustomerId,
      deletedCustomerId,
      adminAccountId,
    );
    customerToken = generateToken({ sub: customerId, role: Role.CUSTOMER });
    otherCustomerToken = generateToken({ sub: otherCustomerId, role: Role.CUSTOMER });
  });

  afterAll(async () => {
    ENV.BOOKING_MAX_ACTIVE_PER_CUSTOMER = defaultActiveLimit;
    const allRoomIds = [roomId, otherRoomId, maintenanceRoomId];
    await drainBackgroundTasks(5000);
    await prisma.auditEvent.deleteMany({
      where: { actorId: { in: [adminId, ...createdUserIds] } },
    });
    await prisma.closure.deleteMany({ where: { roomId: { in: allRoomIds } } });
    await prisma.booking.deleteMany({
      where: {
        OR: [{ roomId: { in: allRoomIds } }, { userId: { in: createdUserIds } }],
      },
    });
    await prisma.room.deleteMany({ where: { id: { in: allRoomIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await accounts.cleanup();
  });

  it('creates booking attached to customer history, writes PII-free audit BOOKING_CREATED_BY_ADMIN and preserves ownership', async () => {
    const slot = nextSlot();
    const res = await postForCustomer(adminToken, {
      customerId,
      roomId,
      ...slot,
      note: 'Khách gọi đặt phòng qua hotline',
    });
    await drainBackgroundTasks(5000);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      totalAmount: '300000.00',
      status: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      note: 'Khách gọi đặt phòng qua hotline',
      customer: {
        kind: 'USER',
        id: customerId,
        name: 'Khách Quen Alpha',
        email: `cwb99_verified_${tag}@example.com`,
        phone: '0901112233',
      },
    });
    expect(res.body.data).not.toHaveProperty('isOngoing');

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(booking.userId).toBe(customerId);
    expect(booking.guestName).toBeNull();
    expect(booking.guestPhone).toBeNull();

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: {
        entityType: 'BOOKING',
        entityId: booking.id,
        action: 'BOOKING_CREATED_BY_ADMIN',
      },
    });
    expect(audit.actorId).toBe(adminId);
    expect(audit.actorRole).toBe(Role.ADMIN);
    expect(audit.after).toEqual({
      customerId,
      bookingCode: booking.bookingCode,
      roomId,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime.toISOString(),
      totalAmount: '300000.00',
      status: BookingStatus.CONFIRMED,
      paymentStatus: 'UNPAID',
    });
    const auditSerialized = JSON.stringify(audit.after);
    expect(auditSerialized).not.toContain('Khách Quen Alpha');
    expect(auditSerialized).not.toContain(`cwb99_verified_${tag}@example.com`);
    expect(auditSerialized).not.toContain('0901112233');

    const outbox = await prisma.emailOutbox.findFirst({
      where: { bookingId: booking.id, kind: 'BOOKING_CONFIRMATION' },
    });
    expect(outbox).not.toBeNull();

    // Target customer sees, gets detail, reschedules, and cancels their booking; another customer gets 404 (IDOR).
    const ownList = await request(app)
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(ownList.status).toBe(200);
    expect(ownList.body.data.items.map((b: { id: string }) => b.id)).toContain(booking.id);

    const ownDetail = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(ownDetail.status).toBe(200);
    expect(ownDetail.body.data.id).toBe(booking.id);

    const otherGet = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`);
    expect(otherGet.status).toBe(404);

    const rescheduledSlot = nextSlot();
    const otherReschedule = await request(app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .send({ roomId: otherRoomId, ...rescheduledSlot });
    expect(otherReschedule.status).toBe(404);

    const ownReschedule = await request(app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ roomId: otherRoomId, ...rescheduledSlot });
    expect(ownReschedule.status).toBe(200);
    expect(ownReschedule.body.data.room.id).toBe(otherRoomId);

    const otherCancel = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${otherCustomerToken}`);
    expect(otherCancel.status).toBe(404);

    // Clean up this booking via customer self-cancel so it doesn't count toward the 5-booking cap later.
    const selfCancel = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(selfCancel.status).toBe(200);
    expect(selfCancel.body.data.status).toBe(BookingStatus.CANCELLED);
  });

  it('rejects unauthenticated (401), CUSTOMER caller (403), and enforces customer role/status/verification guards', async () => {
    const slot = nextSlot();
    const unauthRes = await request(app)
      .post('/api/v1/admin/bookings')
      .send({ customerId, roomId, ...slot });
    expect(unauthRes.status).toBe(401);

    const forbiddenCaller = await postForCustomer(customerToken, {
      customerId,
      roomId,
      ...slot,
    });
    expect(forbiddenCaller.status).toBe(403);

    const lockedRes = await postForCustomer(adminToken, {
      customerId: lockedCustomerId,
      roomId,
      ...slot,
    });
    expect(lockedRes.status).toBe(403);
    expect(lockedRes.body.code).toBe('ACCOUNT_LOCKED');

    const unverifiedRes = await postForCustomer(adminToken, {
      customerId: unverifiedCustomerId,
      roomId,
      ...slot,
    });
    expect(unverifiedRes.status).toBe(403);
    expect(unverifiedRes.body.code).toBe('EMAIL_NOT_VERIFIED');

    const adminTargetRes = await postForCustomer(adminToken, {
      customerId: adminAccountId,
      roomId,
      ...slot,
    });
    expect(adminTargetRes.status).toBe(400);
    expect(adminTargetRes.body.code).toBe('INVALID_CUSTOMER_ROLE');

    const missingRes = await postForCustomer(adminToken, {
      customerId: randomUUID(),
      roomId,
      ...slot,
    });
    expect(missingRes.status).toBe(404);
    expect(missingRes.body.code).toBe('CUSTOMER_NOT_FOUND');

    const deletedRes = await postForCustomer(adminToken, {
      customerId: deletedCustomerId,
      roomId,
      ...slot,
    });
    expect(deletedRes.status).toBe(404);
    expect(deletedRes.body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('enforces room maintenance (409), time rules (400), overlap geometry, boundary touching (201), closure (409), and concurrent 5-booking cap across rooms', async () => {
    // 1. Maintenance room rejection
    const maintSlot = nextSlot();
    const maintRes = await postForCustomer(adminToken, {
      customerId,
      roomId: maintenanceRoomId,
      ...maintSlot,
    });
    expect(maintRes.status).toBe(409);
    expect(maintRes.body.code).toBe('ROOM_NOT_AVAILABLE');

    // 2. Time rule violation (< 1h duration)
    const badStart = new Date(maintSlot.startTime);
    const badTimeRes = await postForCustomer(adminToken, {
      customerId,
      roomId,
      startTime: badStart.toISOString(),
      endTime: new Date(badStart.getTime() + 30 * 60_000).toISOString(),
    });
    expect(badTimeRes.status).toBe(400);

    // 3. Exact, partial, contained overlap vs boundary touching (allowed)
    const baseStart = new Date(nextSlot(4).startTime); // 09:00-13:00 VN
    const slotEnd = new Date(baseStart.getTime() + 4 * 3_600_000);
    const first = await postForCustomer(adminToken, {
      customerId: otherCustomerId,
      roomId,
      startTime: baseStart.toISOString(),
      endTime: slotEnd.toISOString(),
    });
    expect(first.status).toBe(201);
    expect(first.body.data.customer).toMatchObject({
      kind: 'USER',
      id: otherCustomerId,
      phone: null,
    });

    // Partial overlap (12:00-14:00 VN overlaps 09:00-13:00 VN)
    const partialOverlap = await postForCustomer(adminToken, {
      customerId,
      roomId,
      startTime: new Date(baseStart.getTime() + 3 * 3_600_000).toISOString(),
      endTime: new Date(baseStart.getTime() + 5 * 3_600_000).toISOString(),
    });
    expect(partialOverlap.status).toBe(409);
    expect(partialOverlap.body.code).toBe('BOOKING_CONFLICT');

    // Contained overlap (10:00-12:00 VN inside 09:00-13:00 VN)
    const containedOverlap = await postForCustomer(adminToken, {
      customerId,
      roomId,
      startTime: new Date(baseStart.getTime() + 3_600_000).toISOString(),
      endTime: new Date(baseStart.getTime() + 3 * 3_600_000).toISOString(),
    });
    expect(containedOverlap.status).toBe(409);
    expect(containedOverlap.body.code).toBe('BOOKING_CONFLICT');

    // Boundary touching (13:00-14:00 VN right after 09:00-13:00 VN -> allowed)
    const boundaryTouching = await postForCustomer(adminToken, {
      customerId,
      roomId,
      startTime: slotEnd.toISOString(),
      endTime: new Date(slotEnd.getTime() + 3_600_000).toISOString(),
    });
    expect(boundaryTouching.status).toBe(201);

    // 4. Closure conflict
    const closedSlot = nextSlot();
    await prisma.closure.create({
      data: {
        roomId: otherRoomId,
        startTime: new Date(closedSlot.startTime),
        endTime: new Date(closedSlot.endTime),
        reason: 'Bảo trì hệ thống điện',
        createdById: adminId,
      },
    });
    const closedRes = await postForCustomer(adminToken, {
      customerId,
      roomId: otherRoomId,
      ...closedSlot,
    });
    expect(closedRes.status).toBe(409);
    expect(closedRes.body.code).toBe('ROOM_CLOSED');

    // 5. Concurrency on same room slot (2 requests cannot double-book)
    const raceSlot = nextSlot();
    const [raceA, raceB] = await Promise.all([
      postForCustomer(adminToken, { customerId, roomId: otherRoomId, ...raceSlot }),
      postForCustomer(adminToken, {
        customerId: otherCustomerId,
        roomId: otherRoomId,
        ...raceSlot,
      }),
    ]);
    expect([raceA.status, raceB.status].sort((a, b) => a - b)).toEqual([201, 409]);

    // 6. Concurrency on users row lock: 1 customer with 4 active bookings cannot get 2 across different rooms.
    for (let i = 0; i < 4; i++) {
      const fill = await postForCustomer(adminToken, {
        customerId: capCustomerId,
        roomId,
        ...nextSlot(),
      });
      expect(fill.status).toBe(201);
    }

    const capRaceSlotA = nextSlot();
    const capRaceSlotB = nextSlot();
    const [capRaceA, capRaceB] = await Promise.all([
      postForCustomer(adminToken, {
        customerId: capCustomerId,
        roomId,
        ...capRaceSlotA,
      }),
      postForCustomer(adminToken, {
        customerId: capCustomerId,
        roomId: otherRoomId,
        ...capRaceSlotB,
      }),
    ]);
    const capWinner = [capRaceA, capRaceB].find((r) => r.status === 201);
    const capLoser = [capRaceA, capRaceB].find((r) => r.status === 409);
    expect(capWinner).toBeDefined();
    expect(capLoser).toBeDefined();
    expect(capLoser!.body.code).toBe('ACTIVE_BOOKING_LIMIT');
    expect(capLoser!.body.details).toEqual({ limit: 5 });

    const capCount = await prisma.booking.count({
      where: {
        userId: capCustomerId,
        status: BookingStatus.CONFIRMED,
        startTime: { gte: new Date() },
      },
    });
    expect(capCount).toBe(5);
  });

  it('supports Idempotency-Key replay and rejects key reuse with a different customerId', async () => {
    const key = randomUUID();
    const slot = nextSlot();

    const first = await postForCustomer(
      adminToken,
      { customerId, roomId, ...slot, note: 'Đặt qua điện thoại' },
      key,
    );
    expect(first.status).toBe(201);

    const replay = await postForCustomer(
      adminToken,
      { customerId, roomId, ...slot, note: '  Đặt qua điện thoại  ' },
      key,
    );
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data).toEqual(first.body.data);

    const reusedDifferentCustomer = await postForCustomer(
      adminToken,
      { customerId: otherCustomerId, roomId, ...slot, note: 'Đặt qua điện thoại' },
      key,
    );
    expect(reusedDifferentCustomer.status).toBe(409);
    expect(reusedDifferentCustomer.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const auditCount = await prisma.auditEvent.count({
      where: {
        entityType: 'BOOKING',
        entityId: first.body.data.id,
        action: 'BOOKING_CREATED_BY_ADMIN',
      },
    });
    expect(auditCount).toBe(1);
    const outboxCount = await prisma.emailOutbox.count({
      where: { bookingId: first.body.data.id, kind: 'BOOKING_CONFIRMATION' },
    });
    expect(outboxCount).toBe(1);
  });

  it('exposes emailVerified without emailVerifiedAt on GET /api/v1/admin/users for CWB-79 search reuse', async () => {
    const verifiedRes = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ q: `cwb99_verified_${tag}`, role: 'CUSTOMER' });
    expect(verifiedRes.status).toBe(200);
    expect(verifiedRes.body.data.items[0]).toMatchObject({
      id: customerId,
      emailVerified: true,
      status: 'ACTIVE',
    });
    expect(verifiedRes.body.data.items[0]).not.toHaveProperty('emailVerifiedAt');

    const unverifiedRes = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ q: `cwb99_unverified_${tag}`, role: 'CUSTOMER' });
    expect(unverifiedRes.status).toBe(200);
    expect(unverifiedRes.body.data.items[0]).toMatchObject({
      id: unverifiedCustomerId,
      emailVerified: false,
      status: 'ACTIVE',
    });
    expect(unverifiedRes.body.data.items[0]).not.toHaveProperty('emailVerifiedAt');
  });
});
