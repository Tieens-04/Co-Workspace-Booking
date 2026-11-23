import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role, RoomStatus, BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { bookingService } from '../services/booking.service.js';
import { testBookingCode } from './support/test-booking-code.js';

describe('Booking History & Detail Integration Tests (Real MySQL Database)', () => {
  const testPrefix = `test_history_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  let customer1Id: string;
  let customer1Token: string;
  let customer2Id: string;
  let customer2Token: string;

  let roomId: string;
  let maintenanceRoomId: string;

  let c1UpcomingBookingId: string;
  let c1OngoingBookingId: string;
  let c1PastCompletedBookingId: string;
  let c1PastConfirmedBookingId: string;
  let c1PastCheckedInConfirmedBookingId: string;
  let c1FutureCancelledBookingId: string;
  let c1RefundedCancelledBookingId: string;
  let c1PartiallyRefundedCancelledBookingId: string;
  let c1PaidCancelledBookingId: string;
  let c2BookingId: string;
  let c2OngoingBookingId: string;
  let c2CancelledBookingId: string;
  let c2NoShowBookingId: string;

  beforeAll(async () => {
    // 1. Create Customer 1
    const user1 = await prisma.user.create({
      data: {
        email: `${testPrefix}_c1@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Customer One',
        role: Role.CUSTOMER,
      },
    });
    customer1Id = user1.id;
    customer1Token = generateToken({ sub: customer1Id, role: Role.CUSTOMER });

    // 2. Create Customer 2
    const user2 = await prisma.user.create({
      data: {
        email: `${testPrefix}_c2@example.com`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        fullName: 'Customer Two',
        role: Role.CUSTOMER,
      },
    });
    customer2Id = user2.id;
    customer2Token = generateToken({ sub: customer2Id, role: Role.CUSTOMER });

    // 3. Create rooms
    const room = await prisma.room.create({
      data: {
        name: `${testPrefix}_Room`,
        capacity: 8,
        pricePerHour: new Prisma.Decimal('200.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    roomId = room.id;

    const mRoom = await prisma.room.create({
      data: {
        name: `${testPrefix}_Maint_Room`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('150.00'),
        status: RoomStatus.MAINTENANCE,
      },
    });
    maintenanceRoomId = mRoom.id;

    // 4. Create fixtures for Customer 1
    // A. Upcoming CONFIRMED booking (3 days from now)
    const now = Date.now();
    const upStart = new Date(now + 3 * 24 * 60 * 60 * 1000);
    const upEnd = new Date(upStart.getTime() + 2 * 60 * 60 * 1000);
    const bUpcoming = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261001'),
        userId: customer1Id,
        roomId,
        startTime: upStart,
        endTime: upEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: 'Upcoming confirmed booking',
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c1UpcomingBookingId = bUpcoming.id;

    // A2. Ongoing CONFIRMED booking (started 10m ago, ends in 50m)
    const ongoingStart = new Date(now - 10 * 60 * 1000);
    const ongoingEnd = new Date(now + 50 * 60 * 1000);
    const bOngoing = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261001'),
        userId: customer1Id,
        roomId,
        startTime: ongoingStart,
        endTime: ongoingEnd,
        totalAmount: new Prisma.Decimal('200.00'),
        note: 'Ongoing confirmed booking',
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c1OngoingBookingId = bOngoing.id;

    // B. Past COMPLETED booking (5 days ago)
    const pastStart = new Date(now - 5 * 24 * 60 * 60 * 1000);
    const pastEnd = new Date(pastStart.getTime() + 2 * 60 * 60 * 1000);
    const bCompleted = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20260920'),
        userId: customer1Id,
        roomId,
        startTime: pastStart,
        endTime: pastEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: 'Past completed booking',
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: 'CASH',
      },
    });
    c1PastCompletedBookingId = bCompleted.id;

    // C. Past CONFIRMED booking (2 days ago, ended, unchecked-in -> lazily becomes NO_SHOW)
    const pastConfStart = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const pastConfEnd = new Date(pastConfStart.getTime() + 2 * 60 * 60 * 1000);
    const bPastConf = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20260923'),
        userId: customer1Id,
        roomId,
        startTime: pastConfStart,
        endTime: pastConfEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: null,
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c1PastConfirmedBookingId = bPastConf.id;

    // C2. Past CONFIRMED booking that checked in (1 day ago, ended, awaits admin completion)
    const pastCheckedInStart = new Date(now - 1 * 24 * 60 * 60 * 1000);
    const pastCheckedInEnd = new Date(pastCheckedInStart.getTime() + 2 * 60 * 60 * 1000);
    const bPastCheckedIn = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20260924'),
        userId: customer1Id,
        roomId,
        startTime: pastCheckedInStart,
        endTime: pastCheckedInEnd,
        checkedInAt: new Date(pastCheckedInStart.getTime() + 5 * 60 * 1000),
        totalAmount: new Prisma.Decimal('400.00'),
        note: 'Checked-in past confirmed booking',
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: 'CASH',
      },
    });
    c1PastCheckedInConfirmedBookingId = bPastCheckedIn.id;

    // D. Future CANCELLED booking (4 days from now, UNPAID)
    const cancStart = new Date(now + 4 * 24 * 60 * 60 * 1000);
    const cancEnd = new Date(cancStart.getTime() + 2 * 60 * 60 * 1000);
    const bCanc = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20261002'),
        userId: customer1Id,
        roomId,
        startTime: cancStart,
        endTime: cancEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: 'Customer self-cancelled',
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c1FutureCancelledBookingId = bCanc.id;

    // D2. CANCELLED booking with full refund (3 days ago, REFUNDED)
    const cancRefStart = new Date(now - 3 * 24 * 60 * 60 * 1000);
    const cancRefEnd = new Date(cancRefStart.getTime() + 2 * 60 * 60 * 1000);
    const bCancRef = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20260922'),
        userId: customer1Id,
        roomId,
        startTime: cancRefStart,
        endTime: cancRefEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: 'Admin cancelled & refunded',
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED,
        paymentMethod: 'QR',
        refundedAmount: new Prisma.Decimal('400.00'),
        cancelledBy: Role.ADMIN,
        cancellationReason: 'Bảo trì đột xuất',
      },
    });
    c1RefundedCancelledBookingId = bCancRef.id;

    // D3. CANCELLED booking with partial refund (4 days ago, PARTIALLY_REFUNDED)
    const cancPartStart = new Date(now - 4 * 24 * 60 * 60 * 1000);
    const cancPartEnd = new Date(cancPartStart.getTime() + 2 * 60 * 60 * 1000);
    const bCancPart = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20260921'),
        userId: customer1Id,
        roomId,
        startTime: cancPartStart,
        endTime: cancPartEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: 'Partially refunded',
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
        paymentMethod: 'CASH',
        refundedAmount: new Prisma.Decimal('200.00'),
        cancelledBy: Role.CUSTOMER,
      },
    });
    c1PartiallyRefundedCancelledBookingId = bCancPart.id;

    // D4. CANCELLED booking already PAID without refund recorded yet (6 days ago, PAID)
    const cancPaidStart = new Date(now - 6 * 24 * 60 * 60 * 1000);
    const cancPaidEnd = new Date(cancPaidStart.getTime() + 2 * 60 * 60 * 1000);
    const bCancPaid = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20260919'),
        userId: customer1Id,
        roomId,
        startTime: cancPaidStart,
        endTime: cancPaidEnd,
        totalAmount: new Prisma.Decimal('400.00'),
        note: 'Paid then cancelled before refund',
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: 'QR',
        refundedAmount: new Prisma.Decimal('0.00'),
        cancelledBy: Role.CUSTOMER,
      },
    });
    c1PaidCancelledBookingId = bCancPaid.id;

    // 5. Create fixtures for Customer 2 (across views to verify ownership isolation)
    const c2Start = new Date(now + 1 * 24 * 60 * 60 * 1000);
    const c2End = new Date(c2Start.getTime() + 2 * 60 * 60 * 1000);
    const bC2 = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20260928'),
        userId: customer2Id,
        roomId: maintenanceRoomId,
        startTime: c2Start,
        endTime: c2End,
        totalAmount: new Prisma.Decimal('300.00'),
        note: null,
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c2BookingId = bC2.id;

    const bC2Ongoing = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20260928'),
        userId: customer2Id,
        roomId: maintenanceRoomId,
        startTime: new Date(now - 15 * 60 * 1000),
        endTime: new Date(now + 45 * 60 * 1000),
        totalAmount: new Prisma.Decimal('150.00'),
        note: null,
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c2OngoingBookingId = bC2Ongoing.id;

    const bC2Canc = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20260927'),
        userId: customer2Id,
        roomId: maintenanceRoomId,
        startTime: new Date(now - 2 * 24 * 60 * 60 * 1000),
        endTime: new Date(now - 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
        totalAmount: new Prisma.Decimal('300.00'),
        note: null,
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED,
        paymentMethod: 'QR',
        refundedAmount: new Prisma.Decimal('300.00'),
      },
    });
    c2CancelledBookingId = bC2Canc.id;

    const bC2NoShow = await prisma.booking.create({
      data: {
        bookingCode: testBookingCode('20260926'),
        userId: customer2Id,
        roomId: maintenanceRoomId,
        startTime: new Date(now - 3 * 24 * 60 * 60 * 1000),
        endTime: new Date(now - 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
        totalAmount: new Prisma.Decimal('300.00'),
        note: null,
        status: BookingStatus.NO_SHOW,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
      },
    });
    c2NoShowBookingId = bC2NoShow.id;
  });

  afterAll(async () => {
    // Delete in FK order: bookings -> rooms -> users (safe even if beforeAll fails partway)
    const userIds = [customer1Id, customer2Id].filter(Boolean);
    const roomIds = [roomId, maintenanceRoomId].filter(Boolean);

    if (userIds.length > 0) {
      await prisma.booking.deleteMany({
        where: { userId: { in: userIds } },
      });
    }

    if (roomIds.length > 0) {
      await prisma.room.deleteMany({
        where: { id: { in: roomIds } },
      });
    }

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    await prisma.$disconnect();
  });

  describe('AC1: Customer isolation and ownership', () => {
    it('Customer 1 only sees their own bookings in list and pagination count', async () => {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pagination.total).toBe(9);
      expect(res.body.data.items).toHaveLength(9);

      const returnedIds = res.body.data.items.map((item: { id: string }) => item.id);
      expect(returnedIds).toContain(c1UpcomingBookingId);
      expect(returnedIds).toContain(c1OngoingBookingId);
      expect(returnedIds).toContain(c1PastCompletedBookingId);
      expect(returnedIds).toContain(c1PastConfirmedBookingId);
      expect(returnedIds).toContain(c1PastCheckedInConfirmedBookingId);
      expect(returnedIds).toContain(c1FutureCancelledBookingId);
      expect(returnedIds).toContain(c1RefundedCancelledBookingId);
      expect(returnedIds).toContain(c1PartiallyRefundedCancelledBookingId);
      expect(returnedIds).toContain(c1PaidCancelledBookingId);
      expect(returnedIds).not.toContain(c2BookingId);
      expect(returnedIds).not.toContain(c2OngoingBookingId);
      expect(returnedIds).not.toContain(c2CancelledBookingId);
      expect(returnedIds).not.toContain(c2NoShowBookingId);
    });

    it('Customer 2 only sees their own bookings across ALL, UPCOMING, COMPLETED, and CANCELLED views', async () => {
      const allRes = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${customer2Token}`);
      expect(allRes.status).toBe(200);
      expect(allRes.body.data.pagination.total).toBe(4);
      expect(allRes.body.data.items.map((i: { id: string }) => i.id)).toEqual(
        expect.arrayContaining([
          c2BookingId,
          c2OngoingBookingId,
          c2CancelledBookingId,
          c2NoShowBookingId,
        ]),
      );

      for (const view of ['UPCOMING', 'COMPLETED', 'CANCELLED'] as const) {
        const res = await request(app)
          .get(`/api/v1/bookings?view=${view}`)
          .set('Authorization', `Bearer ${customer2Token}`);
        expect(res.status).toBe(200);
        const ids = res.body.data.items.map((i: { id: string }) => i.id);
        expect(ids).not.toContain(c1UpcomingBookingId);
        expect(ids).not.toContain(c1OngoingBookingId);
        expect(ids).not.toContain(c1PastCompletedBookingId);
        expect(ids).not.toContain(c1FutureCancelledBookingId);
        expect(ids).not.toContain(c1RefundedCancelledBookingId);
        expect(ids).not.toContain(c1PaidCancelledBookingId);
      }
    });

    it('Customer 1 attempting to view Customer 2 booking detail returns 404 BOOKING_NOT_FOUND', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${c2BookingId}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('BOOKING_NOT_FOUND');
      expect(res.body.message).toBe('Không tìm thấy đặt phòng');
    });
  });

  describe('View Filters (ALL, UPCOMING, COMPLETED, CANCELLED)', () => {
    it('view=UPCOMING includes ongoing CONFIRMED bookings first (isOngoing=true) followed by future CONFIRMED bookings and excludes ended CONFIRMED bookings', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?view=UPCOMING')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0]).toMatchObject({
        id: c1OngoingBookingId,
        status: 'CONFIRMED',
        isOngoing: true,
      });
      expect(res.body.data.items[1]).toMatchObject({
        id: c1UpcomingBookingId,
        status: 'CONFIRMED',
        isOngoing: false,
      });

      const pagedRes = await request(app)
        .get('/api/v1/bookings?view=UPCOMING&page=1&limit=1')
        .set('Authorization', `Bearer ${customer1Token}`);
      expect(pagedRes.status).toBe(200);
      expect(pagedRes.body.data.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
      expect(pagedRes.body.data.items[0].id).toBe(c1OngoingBookingId);
    });

    it('view=COMPLETED ("Đã kết thúc") returns COMPLETED and NO_SHOW bookings without inferring completion for ended checked-in CONFIRMED bookings', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?view=COMPLETED')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.items).toHaveLength(2);
      // Ordered by startTime DESC: c1PastConfirmedBookingId (2d ago -> lazily NO_SHOW) then c1PastCompletedBookingId (5d ago)
      expect(res.body.data.items[0]).toMatchObject({
        id: c1PastConfirmedBookingId,
        status: 'NO_SHOW',
        isOngoing: false,
      });
      expect(res.body.data.items[1]).toMatchObject({
        id: c1PastCompletedBookingId,
        status: 'COMPLETED',
        isOngoing: false,
      });
      const ids = res.body.data.items.map((item: { id: string }) => item.id);
      expect(ids).not.toContain(c1PastCheckedInConfirmedBookingId);
    });

    it('view=CANCELLED returns all CANCELLED bookings regardless of refund/payment status in startTime desc order with accurate pagination', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?view=CANCELLED')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(4);
      expect(res.body.data.items).toHaveLength(4);
      expect(res.body.data.items[0]).toMatchObject({
        id: c1FutureCancelledBookingId,
        status: 'CANCELLED',
        paymentStatus: 'UNPAID',
        isOngoing: false,
      });
      expect(res.body.data.items[1]).toMatchObject({
        id: c1RefundedCancelledBookingId,
        status: 'CANCELLED',
        paymentStatus: 'REFUNDED',
        refundedAmount: '400.00',
        isOngoing: false,
      });
      expect(res.body.data.items[2]).toMatchObject({
        id: c1PartiallyRefundedCancelledBookingId,
        status: 'CANCELLED',
        paymentStatus: 'PARTIALLY_REFUNDED',
        refundedAmount: '200.00',
        isOngoing: false,
      });
      expect(res.body.data.items[3]).toMatchObject({
        id: c1PaidCancelledBookingId,
        status: 'CANCELLED',
        paymentStatus: 'PAID',
        refundedAmount: '0.00',
        isOngoing: false,
      });

      const pagedRes = await request(app)
        .get('/api/v1/bookings?view=CANCELLED&page=2&limit=2')
        .set('Authorization', `Bearer ${customer1Token}`);
      expect(pagedRes.status).toBe(200);
      expect(pagedRes.body.data.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 4,
        totalPages: 2,
      });
      expect(pagedRes.body.data.items).toHaveLength(2);
      expect(pagedRes.body.data.items[0].id).toBe(c1PartiallyRefundedCancelledBookingId);
      expect(pagedRes.body.data.items[1].id).toBe(c1PaidCancelledBookingId);
    });

    it('view=ALL returns all bookings ordered by startTime desc with ongoing flag accurate', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?view=ALL')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(9);
      const items = res.body.data.items;
      // Start times in desc order
      for (let i = 0; i < items.length - 1; i++) {
        const curr = new Date(items[i].startTime).getTime();
        const next = new Date(items[i + 1].startTime).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }
      const ongoingItem = items.find((item: { id: string }) => item.id === c1OngoingBookingId);
      expect(ongoingItem?.isOngoing).toBe(true);
    });
  });

  describe('CWB-92: Exact time boundaries (startTime = now, endTime = now)', () => {
    const fixedNow = new Date('2026-11-22T06:00:00.000Z');
    let boundaryUserId: string;
    const boundaryBookingIds: string[] = [];

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: `${testPrefix}_boundary@example.com`,
          passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
          fullName: 'Boundary Customer',
          role: Role.CUSTOMER,
        },
      });
      boundaryUserId = user.id;

      // 1. startTime === fixedNow, endTime > fixedNow (CONFIRMED) -> ongoing & in UPCOMING
      const bStartAtNow = await prisma.booking.create({
        data: {
          bookingCode: testBookingCode('20261122'),
          userId: boundaryUserId,
          roomId,
          startTime: fixedNow,
          endTime: new Date(fixedNow.getTime() + 60 * 60 * 1000),
          totalAmount: new Prisma.Decimal('200.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });
      boundaryBookingIds.push(bStartAtNow.id);

      // 2. endTime === fixedNow (CONFIRMED, unchecked-in) -> lazily NO_SHOW, excluded from UPCOMING, included in COMPLETED
      const bEndAtNowNoCheckin = await prisma.booking.create({
        data: {
          bookingCode: testBookingCode('20261122'),
          userId: boundaryUserId,
          roomId,
          startTime: new Date(fixedNow.getTime() - 60 * 60 * 1000),
          endTime: fixedNow,
          totalAmount: new Prisma.Decimal('200.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
          attendanceTrackingEnabled: true,
          checkedInAt: null,
        },
      });
      boundaryBookingIds.push(bEndAtNowNoCheckin.id);

      // 3. endTime === fixedNow (CONFIRMED, checked-in) -> stays CONFIRMED, excluded from UPCOMING & COMPLETED
      const bEndAtNowCheckedIn = await prisma.booking.create({
        data: {
          bookingCode: testBookingCode('20261122'),
          userId: boundaryUserId,
          roomId,
          startTime: new Date(fixedNow.getTime() - 60 * 60 * 1000),
          endTime: fixedNow,
          checkedInAt: new Date(fixedNow.getTime() - 55 * 60 * 1000),
          totalAmount: new Prisma.Decimal('200.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: 'CASH',
        },
      });
      boundaryBookingIds.push(bEndAtNowCheckedIn.id);

      // 4. startTime < fixedNow < endTime (endTime = fixedNow + 1s, CONFIRMED) -> ongoing & in UPCOMING
      const bEndingJustAfterNow = await prisma.booking.create({
        data: {
          bookingCode: testBookingCode('20261122'),
          userId: boundaryUserId,
          roomId,
          startTime: new Date(fixedNow.getTime() - 30 * 60 * 1000),
          endTime: new Date(fixedNow.getTime() + 1000),
          totalAmount: new Prisma.Decimal('200.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });
      boundaryBookingIds.push(bEndingJustAfterNow.id);

      // 5. startTime > fixedNow (CONFIRMED) -> in UPCOMING after ongoing bookings, isOngoing = false
      const bFuture = await prisma.booking.create({
        data: {
          bookingCode: testBookingCode('20261122'),
          userId: boundaryUserId,
          roomId,
          startTime: new Date(fixedNow.getTime() + 30 * 60 * 1000),
          endTime: new Date(fixedNow.getTime() + 90 * 60 * 1000),
          totalAmount: new Prisma.Decimal('200.00'),
          status: BookingStatus.CONFIRMED,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });
      boundaryBookingIds.push(bFuture.id);
    });

    afterAll(async () => {
      if (boundaryUserId) {
        await prisma.booking.deleteMany({ where: { userId: boundaryUserId } });
        await prisma.user.deleteMany({ where: { id: boundaryUserId } });
      }
    });

    it('includes startTime = now and endTime = now + 1s in UPCOMING as ongoing and excludes endTime = now from UPCOMING', async () => {
      const upcoming = await bookingService.getBookings(
        boundaryUserId,
        { page: 1, limit: 10, view: 'UPCOMING' },
        fixedNow,
      );

      expect(upcoming.pagination.total).toBe(3);
      expect(upcoming.items).toHaveLength(3);
      // Ordered by startTime ASC: started 30m ago (ongoing) -> started at fixedNow (ongoing) -> future
      expect(upcoming.items[0]).toMatchObject({
        id: boundaryBookingIds[3],
        status: BookingStatus.CONFIRMED,
        isOngoing: true,
      });
      expect(upcoming.items[1]).toMatchObject({
        id: boundaryBookingIds[0],
        status: BookingStatus.CONFIRMED,
        isOngoing: true,
      });
      expect(upcoming.items[2]).toMatchObject({
        id: boundaryBookingIds[4],
        status: BookingStatus.CONFIRMED,
        isOngoing: false,
      });

      const ended = await bookingService.getBookings(
        boundaryUserId,
        { page: 1, limit: 10, view: 'COMPLETED' },
        fixedNow,
      );
      expect(ended.pagination.total).toBe(1);
      expect(ended.items[0]).toMatchObject({
        id: boundaryBookingIds[1],
        status: BookingStatus.NO_SHOW,
        isOngoing: false,
      });

      const all = await bookingService.getBookings(
        boundaryUserId,
        { page: 1, limit: 10, view: 'ALL' },
        fixedNow,
      );
      const checkedInAtBoundary = all.items.find((item) => item.id === boundaryBookingIds[2]);
      expect(checkedInAtBoundary).toMatchObject({
        id: boundaryBookingIds[2],
        status: BookingStatus.CONFIRMED,
        isOngoing: false,
      });
    });
  });

  describe('AC2: Field details and preserved amounts', () => {
    it('returns booking detail with code, time, totalAmount as string, and status', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${c1UpcomingBookingId}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: c1UpcomingBookingId,
        totalAmount: '400.00',
        status: 'CONFIRMED',
        paymentStatus: 'UNPAID',
        paymentMethod: null,
        refundedAmount: '0.00',
        isOngoing: false,
        room: {
          id: roomId,
          name: `${testPrefix}_Room`,
        },
      });
      expect(res.body.data.bookingCode).toMatch(/^CS-\d{8}-[A-Z0-9]+$/);
    });

    it('preserves persisted totalAmount even when room price changes', async () => {
      // Temporarily change room price to 999.00
      await prisma.room.update({
        where: { id: roomId },
        data: { pricePerHour: new Prisma.Decimal('999.00') },
      });

      const res = await request(app)
        .get(`/api/v1/bookings/${c1UpcomingBookingId}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalAmount).toBe('400.00');

      // Restore room price
      await prisma.room.update({
        where: { id: roomId },
        data: { pricePerHour: new Prisma.Decimal('200.00') },
      });
    });

    it('GET operations do not modify booking status or timestamps', async () => {
      const before = await prisma.booking.findUnique({
        where: { id: c1PastConfirmedBookingId },
      });

      await request(app).get('/api/v1/bookings').set('Authorization', `Bearer ${customer1Token}`);

      await request(app)
        .get(`/api/v1/bookings/${c1PastConfirmedBookingId}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      const after = await prisma.booking.findUnique({
        where: { id: c1PastConfirmedBookingId },
      });

      expect(after?.status).toBe(before?.status);
      expect(after?.paymentStatus).toBe(before?.paymentStatus);
      expect(after?.updatedAt).toEqual(before?.updatedAt);
    });
  });
});
