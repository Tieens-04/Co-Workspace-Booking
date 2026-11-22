import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { TestAccounts } from './support/test-accounts.js';

/**
 * CWB-94: MySQL LIKE wildcard (`%`, `_`, `\`) escaping across all four search endpoints:
 * - GET /api/v1/rooms?q=...
 * - GET /api/v1/admin/rooms?q=...
 * - GET /api/v1/admin/bookings?customer=...
 * - GET /api/v1/admin/users?q=...
 */
describe('Search LIKE wildcard escaping (CWB-94, real MySQL)', () => {
  const accounts = new TestAccounts();
  afterAll(() => accounts.cleanup());

  // Alphanumeric-only tag so the tag itself never introduces `%`, `_`, or `\`.
  const tag = randomUUID().replace(/-/g, '').slice(0, 10);
  let adminToken: string;

  const roomIds: string[] = [];
  const userIds: string[] = [];
  const bookingIds: string[] = [];

  let roomPercentId: string;
  let roomUnderscoreId: string;
  let roomBackslashId: string;
  let roomPlainId: string;
  let roomVietnameseId: string;
  let roomArchivedPercentId: string;

  let userPercentId: string;
  let userUnderscoreId: string;
  let userBackslashId: string;
  let userPlainId: string;
  let userVietnameseId: string;
  let userDeletedPercentId: string;

  let bookingUserPercentId: string;
  let bookingUserUnderscoreId: string;
  let bookingUserBackslashId: string;
  let bookingUserPlainId: string;
  let bookingGuestPercentId: string;
  let bookingGuestUnderscoreId: string;
  let bookingGuestBackslashId: string;
  let bookingGuestPlainId: string;
  let bookingGuestVietnameseId: string;

  let slotSeq = 1;
  const nextSlot = () => {
    const base = new Date();
    base.setUTCHours(2, 0, 0, 0);
    const start = new Date(base.getTime() + slotSeq++ * 86_400_000);
    return { start, end: new Date(start.getTime() + 3_600_000) };
  };

  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  const createRoom = async (name: string, status: RoomStatus = RoomStatus.AVAILABLE) => {
    const room = await prisma.room.create({
      data: {
        name,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100000.00'),
        status,
      },
    });
    roomIds.push(room.id);
    return room.id;
  };

  const createUser = async (data: {
    email: string;
    fullName: string;
    phoneNumber?: string | null;
    deletedAt?: Date | null;
  }) => {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        phoneNumber: data.phoneNumber ?? null,
        passwordHash: '!cwb94-not-a-bcrypt-hash',
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
        deletedAt: data.deletedAt ?? null,
      },
    });
    userIds.push(user.id);
    return user.id;
  };

  const createBooking = async (
    userId: string | null,
    guest?: { guestName: string; guestPhone: string },
  ) => {
    const slot = nextSlot();
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `C94-${tag}-${slotSeq}`,
        userId,
        roomId: roomPlainId,
        startTime: slot.start,
        endTime: slot.end,
        totalAmount: new Prisma.Decimal('100000.00'),
        status: BookingStatus.CONFIRMED,
        ...(guest ?? {}),
      },
    });
    bookingIds.push(booking.id);
    return booking.id;
  };

  beforeAll(async () => {
    adminToken = accounts.token(Role.ADMIN);
    await accounts.persist();

    roomPercentId = await createRoom(`CWB94 ${tag} Sale 50%`);
    roomUnderscoreId = await createRoom(`CWB94 ${tag} Room_A`);
    roomBackslashId = await createRoom(`CWB94 ${tag} Khu\\A`);
    roomPlainId = await createRoom(`CWB94 ${tag} RoomXA Sale 500 KhuA`);
    roomVietnameseId = await createRoom(`CWB94 ${tag} Phòng Họp Sáng Tạo`);
    roomArchivedPercentId = await createRoom(`CWB94 ${tag} Lưu Trữ 25%`, RoomStatus.ARCHIVED);

    userPercentId = await createUser({
      email: `cwb94pct${tag}@example.com`,
      fullName: `Khach 50% ${tag}`,
      phoneNumber: '0901000001',
    });
    userUnderscoreId = await createUser({
      email: `cwb94_under_${tag}@example.com`,
      fullName: `nguyen_van ${tag}`,
      phoneNumber: '0901000002',
    });
    userBackslashId = await createUser({
      email: `cwb94bs${tag}@example.com`,
      fullName: `Team\\Alpha ${tag}`,
      phoneNumber: '0901000003',
    });
    userPlainId = await createUser({
      email: `cwb94XunderX${tag}@example.com`,
      fullName: `nguyenXvan 500 TeamAlpha ${tag}`,
      phoneNumber: '0901000004',
    });
    userVietnameseId = await createUser({
      email: `cwb94vn${tag}@example.com`,
      fullName: `Nguyễn Thị Ánh ${tag}`,
      phoneNumber: '0901000005',
    });
    userDeletedPercentId = await createUser({
      email: `deleted-${tag}@deleted.invalid`,
      fullName: `Deleted 99% ${tag}`,
      deletedAt: new Date(),
    });

    bookingUserPercentId = await createBooking(userPercentId);
    bookingUserUnderscoreId = await createBooking(userUnderscoreId);
    bookingUserBackslashId = await createBooking(userBackslashId);
    bookingUserPlainId = await createBooking(userPlainId);

    bookingGuestPercentId = await createBooking(null, {
      guestName: `Guest 80% ${tag}`,
      guestPhone: '0911000001',
    });
    bookingGuestUnderscoreId = await createBooking(null, {
      guestName: `guest_van ${tag}`,
      guestPhone: '0911000002',
    });
    bookingGuestBackslashId = await createBooking(null, {
      guestName: `Guest\\Beta ${tag}`,
      guestPhone: '0911000003',
    });
    bookingGuestPlainId = await createBooking(null, {
      guestName: `guestXvan 800 GuestBeta ${tag}`,
      guestPhone: '0911000004',
    });
    bookingGuestVietnameseId = await createBooking(null, {
      guestName: `Trần Minh Đức ${tag}`,
      guestPhone: '0911000005',
    });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe('GET /api/v1/rooms?q=', () => {
    it('matches literal %, _, and \\ only instead of acting as SQL LIKE wildcards', async () => {
      const pctRes = await request(app).get('/api/v1/rooms').query({ q: '%', limit: 100 });
      expect(pctRes.status).toBe(200);
      const pctItems = pctRes.body.data.items as Array<{ id: string; name: string }>;
      expect(pctItems.map((r) => r.id)).toContain(roomPercentId);
      expect(pctItems.map((r) => r.id)).not.toContain(roomPlainId);
      expect(pctItems.map((r) => r.id)).not.toContain(roomUnderscoreId);
      expect(pctItems.map((r) => r.id)).not.toContain(roomBackslashId);
      expect(pctItems.map((r) => r.id)).not.toContain(roomArchivedPercentId);
      expect(pctItems.every((r) => r.name.includes('%'))).toBe(true);

      const doublePctRes = await request(app).get('/api/v1/rooms').query({ q: '%%', limit: 100 });
      expect(doublePctRes.status).toBe(200);
      const doublePctIds = doublePctRes.body.data.items.map((r: { id: string }) => r.id);
      expect(doublePctIds).not.toContain(roomPercentId);
      expect(doublePctIds).not.toContain(roomPlainId);

      const undRes = await request(app).get('/api/v1/rooms').query({ q: '_', limit: 100 });
      expect(undRes.status).toBe(200);
      const undItems = undRes.body.data.items as Array<{ id: string; name: string }>;
      expect(undItems.map((r) => r.id)).toContain(roomUnderscoreId);
      expect(undItems.map((r) => r.id)).not.toContain(roomPlainId);
      expect(undItems.map((r) => r.id)).not.toContain(roomPercentId);
      expect(undItems.every((r) => r.name.includes('_'))).toBe(true);

      const exactUndRes = await request(app)
        .get('/api/v1/rooms')
        .query({ q: `${tag} Room_A`, limit: 100 });
      expect(exactUndRes.status).toBe(200);
      expect(exactUndRes.body.data.items.map((r: { id: string }) => r.id)).toEqual([
        roomUnderscoreId,
      ]);

      const bsRes = await request(app).get('/api/v1/rooms').query({ q: '\\', limit: 100 });
      expect(bsRes.status).toBe(200);
      const bsItems = bsRes.body.data.items as Array<{ id: string; name: string }>;
      expect(bsItems.map((r) => r.id)).toContain(roomBackslashId);
      expect(bsItems.map((r) => r.id)).not.toContain(roomPlainId);
      expect(bsItems.every((r) => r.name.includes('\\'))).toBe(true);
    });

    it('preserves Vietnamese diacritic and case-insensitive search and keeps q length limit at 100', async () => {
      for (const q of [`${tag} phòng họp sáng tạo`, `${tag} PHÒNG HỌP SÁNG TẠO`]) {
        const res = await request(app).get('/api/v1/rooms').query({ q, limit: 100 });
        expect(res.status).toBe(200);
        expect(res.body.data.items.map((r: { id: string }) => r.id)).toEqual([roomVietnameseId]);
      }

      const maxLenRes = await request(app)
        .get('/api/v1/rooms')
        .query({ q: '%'.repeat(100), limit: 10 });
      expect(maxLenRes.status).toBe(200);
      expect(maxLenRes.body.data.items).toEqual([]);
      expect(maxLenRes.body.data.pagination.total).toBe(0);

      const tooLongRes = await request(app)
        .get('/api/v1/rooms')
        .query({ q: 'a'.repeat(101), limit: 10 });
      expect(tooLongRes.status).toBe(400);
      expect(tooLongRes.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/admin/rooms?q=', () => {
    it('matches literal %, _, and \\ (including archived rooms) and preserves Vietnamese case-insensitive search', async () => {
      const pctRes = await asAdmin(
        request(app).get('/api/v1/admin/rooms').query({ q: '%', limit: 100 }),
      );
      expect(pctRes.status).toBe(200);
      const pctItems = pctRes.body.data.items as Array<{ id: string; name: string }>;
      expect(pctItems.map((r) => r.id)).toContain(roomPercentId);
      expect(pctItems.map((r) => r.id)).toContain(roomArchivedPercentId);
      expect(pctItems.map((r) => r.id)).not.toContain(roomPlainId);
      expect(pctItems.map((r) => r.id)).not.toContain(roomUnderscoreId);
      expect(pctItems.every((r) => r.name.includes('%'))).toBe(true);

      const bareUndRes = await asAdmin(
        request(app).get('/api/v1/admin/rooms').query({ q: '_', limit: 100 }),
      );
      expect(bareUndRes.status).toBe(200);
      const bareUndItems = bareUndRes.body.data.items as Array<{ id: string; name: string }>;
      expect(bareUndItems.map((r) => r.id)).toContain(roomUnderscoreId);
      expect(bareUndItems.map((r) => r.id)).not.toContain(roomPlainId);
      expect(bareUndItems.every((r) => r.name.includes('_'))).toBe(true);

      const undRes = await asAdmin(
        request(app)
          .get('/api/v1/admin/rooms')
          .query({ q: `${tag} Room_A`, limit: 100 }),
      );
      expect(undRes.status).toBe(200);
      expect(undRes.body.data.items.map((r: { id: string }) => r.id)).toEqual([roomUnderscoreId]);

      const bareBsRes = await asAdmin(
        request(app).get('/api/v1/admin/rooms').query({ q: '\\', limit: 100 }),
      );
      expect(bareBsRes.status).toBe(200);
      const bareBsItems = bareBsRes.body.data.items as Array<{ id: string; name: string }>;
      expect(bareBsItems.map((r) => r.id)).toContain(roomBackslashId);
      expect(bareBsItems.map((r) => r.id)).not.toContain(roomPlainId);
      expect(bareBsItems.every((r) => r.name.includes('\\'))).toBe(true);

      const bsRes = await asAdmin(
        request(app)
          .get('/api/v1/admin/rooms')
          .query({ q: `${tag} Khu\\A`, limit: 100 }),
      );
      expect(bsRes.status).toBe(200);
      expect(bsRes.body.data.items.map((r: { id: string }) => r.id)).toEqual([roomBackslashId]);

      const vnRes = await asAdmin(
        request(app)
          .get('/api/v1/admin/rooms')
          .query({ q: `${tag} lưu trữ 25%`, limit: 100 }),
      );
      expect(vnRes.status).toBe(200);
      expect(vnRes.body.data.items.map((r: { id: string }) => r.id)).toEqual([
        roomArchivedPercentId,
      ]);

      const maxLenRes = await asAdmin(
        request(app)
          .get('/api/v1/admin/rooms')
          .query({ q: '_'.repeat(100), limit: 10 }),
      );
      expect(maxLenRes.status).toBe(200);

      const tooLongRes = await asAdmin(
        request(app)
          .get('/api/v1/admin/rooms')
          .query({ q: 'a'.repeat(101), limit: 10 }),
      );
      expect(tooLongRes.status).toBe(400);
      expect(tooLongRes.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/admin/bookings?customer=', () => {
    it('matches literal %, _, and \\ for registered customers and walk-in guests without wildcard expansion', async () => {
      const searchIds = async (customer: string) => {
        const res = await asAdmin(
          request(app).get('/api/v1/admin/bookings').query({ customer, limit: 100 }),
        );
        expect(res.status).toBe(200);
        return res.body.data.items.map((b: { id: string }) => b.id);
      };

      const pctIds = await searchIds('%');
      expect(pctIds).toContain(bookingUserPercentId);
      expect(pctIds).toContain(bookingGuestPercentId);
      expect(pctIds).not.toContain(bookingUserPlainId);
      expect(pctIds).not.toContain(bookingGuestPlainId);
      expect(pctIds).not.toContain(bookingUserUnderscoreId);

      const undIds = await searchIds('_');
      expect(undIds).toContain(bookingUserUnderscoreId);
      expect(undIds).toContain(bookingGuestUnderscoreId);
      expect(undIds).not.toContain(bookingUserPlainId);
      expect(undIds).not.toContain(bookingGuestPlainId);

      expect(await searchIds(`nguyen_van ${tag}`)).toEqual([bookingUserUnderscoreId]);
      expect(await searchIds(`cwb94_under_${tag}`)).toEqual([bookingUserUnderscoreId]);
      expect(await searchIds(`guest_van ${tag}`)).toEqual([bookingGuestUnderscoreId]);

      const bsIds = await searchIds('\\');
      expect(bsIds).toContain(bookingUserBackslashId);
      expect(bsIds).toContain(bookingGuestBackslashId);
      expect(bsIds).not.toContain(bookingUserPlainId);
      expect(bsIds).not.toContain(bookingGuestPlainId);

      expect(await searchIds(`trần minh đức ${tag}`)).toEqual([bookingGuestVietnameseId]);
      expect(await searchIds(`TRẦN MINH ĐỨC ${tag}`)).toEqual([bookingGuestVietnameseId]);
    });
  });

  describe('GET /api/v1/admin/users?q=', () => {
    it('matches literal %, _, and \\ without wildcard expansion and preserves Vietnamese case-insensitive search', async () => {
      const search = async (q: string) => {
        const res = await asAdmin(request(app).get('/api/v1/admin/users').query({ q, limit: 100 }));
        expect(res.status).toBe(200);
        return res.body.data.items as Array<{
          id: string;
          email: string;
          fullName: string;
          phoneNumber: string | null;
        }>;
      };

      const pctItems = await search('%');
      expect(pctItems.map((u) => u.id)).toContain(userPercentId);
      expect(pctItems.map((u) => u.id)).not.toContain(userPlainId);
      expect(pctItems.map((u) => u.id)).not.toContain(userUnderscoreId);
      expect(pctItems.map((u) => u.id)).not.toContain(userDeletedPercentId);
      expect(
        pctItems.every(
          (u) =>
            u.email.includes('%') ||
            u.fullName.includes('%') ||
            (u.phoneNumber?.includes('%') ?? false),
        ),
      ).toBe(true);

      const undItems = await search('_');
      expect(undItems.map((u) => u.id)).toContain(userUnderscoreId);
      expect(undItems.map((u) => u.id)).not.toContain(userPlainId);
      expect(undItems.map((u) => u.id)).not.toContain(userPercentId);
      expect(
        undItems.every(
          (u) =>
            u.email.includes('_') ||
            u.fullName.includes('_') ||
            (u.phoneNumber?.includes('_') ?? false),
        ),
      ).toBe(true);

      expect((await search(`nguyen_van ${tag}`)).map((u) => u.id)).toEqual([userUnderscoreId]);
      expect((await search(`cwb94_under_${tag}`)).map((u) => u.id)).toEqual([userUnderscoreId]);

      const bsItems = await search('\\');
      expect(bsItems.map((u) => u.id)).toContain(userBackslashId);
      expect(bsItems.map((u) => u.id)).not.toContain(userPlainId);
      expect(
        bsItems.every(
          (u) =>
            u.email.includes('\\') ||
            u.fullName.includes('\\') ||
            (u.phoneNumber?.includes('\\') ?? false),
        ),
      ).toBe(true);

      expect((await search(`nguyễn thị ánh ${tag}`)).map((u) => u.id)).toEqual([userVietnameseId]);
      expect((await search(`NGUYỄN THỊ ÁNH ${tag}`)).map((u) => u.id)).toEqual([userVietnameseId]);
    });
  });
});
