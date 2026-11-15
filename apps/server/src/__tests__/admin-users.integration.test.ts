import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { hashPassword } from '../utils/password.util.js';
import { adminUserRepository } from '../repositories/admin-user.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { TestAccounts } from './support/test-accounts.js';
import { drainBackgroundTasks } from '../utils/background-tasks.util.js';

/** CWB-79: admin customer management — list/search, lock/unlock, locked-account enforcement. */
describe('Admin customer management (CWB-79, real MySQL)', () => {
  const accounts = new TestAccounts();
  afterAll(() => accounts.cleanup());

  const tag = randomUUID().slice(0, 8);
  const password = 'Password123!';
  let adminId: string;
  let adminToken: string;
  let otherAdminId: string;
  let roomId: string;
  const userIds: string[] = [];
  let codeSeq = 0;
  let dayOffset = 1;

  const nextSlot = () => {
    const base = new Date();
    base.setUTCHours(2, 0, 0, 0); // 09:00 Vietnam
    const start = new Date(base.getTime() + dayOffset++ * 86_400_000);
    return { start, end: new Date(start.getTime() + 3_600_000) };
  };

  const createCustomer = async (label: string, phoneNumber: string | null = null) => {
    const user = await prisma.user.create({
      data: {
        email: `cwb79_${tag}_${label}@example.com`,
        passwordHash: await hashPassword(password),
        fullName: `Khách ${label} ${tag}`,
        phoneNumber,
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(user.id);
    return { ...user, token: generateToken({ sub: user.id, role: Role.CUSTOMER, tv: 0 }) };
  };

  const insertBooking = (
    userId: string | null,
    status: BookingStatus,
    slot = nextSlot(),
    guest?: { guestName: string; guestPhone: string },
  ) =>
    prisma.booking.create({
      data: {
        bookingCode: `U79-${tag}-${++codeSeq}`,
        userId,
        roomId,
        startTime: slot.start,
        endTime: slot.end,
        totalAmount: new Prisma.Decimal('100000.00'),
        status,
        ...(guest ?? {}),
      },
    });

  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);
  const setStatus = (id: string, body: object, token = adminToken) =>
    request(app)
      .patch(`/api/v1/admin/users/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const login = (email: string) =>
    request(app).post('/api/v1/auth/login').send({ email, password });

  beforeAll(async () => {
    adminId = randomUUID();
    otherAdminId = randomUUID();
    adminToken = accounts.token(Role.ADMIN, adminId);
    accounts.token(Role.ADMIN, otherAdminId);
    await accounts.persist();
    const room = await prisma.room.create({
      data: {
        name: `Users ${tag}`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100000.00'),
        status: RoomStatus.AVAILABLE,
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    await drainBackgroundTasks(5000);
    await prisma.booking.deleteMany({ where: { roomId } });
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.auditEvent.deleteMany({ where: { entityId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe('access control', () => {
    it('returns 401 without a token and 403 for a customer', async () => {
      const customer = await createCustomer('rbac');
      expect((await request(app).get('/api/v1/admin/users')).status).toBe(401);
      const asCustomer = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${customer.token}`);
      expect(asCustomer.status).toBe(403);
      const patch = await setStatus(customer.id, { status: 'LOCKED', reason: 'x' }, customer.token);
      expect(patch.status).toBe(403);
    });
  });

  describe('GET /admin/users', () => {
    it('searches by email, name and phone with booking stats and no password data', async () => {
      const customer = await createCustomer('search', '0912345678');
      await insertBooking(customer.id, BookingStatus.CONFIRMED);
      await insertBooking(customer.id, BookingStatus.NO_SHOW, {
        start: new Date(Date.now() - 3 * 86_400_000),
        end: new Date(Date.now() - 3 * 86_400_000 + 3_600_000),
      });
      await insertBooking(customer.id, BookingStatus.CANCELLED);

      for (const q of [customer.email.toUpperCase(), `search ${tag}`, '0912345678']) {
        const res = await asAdmin(request(app).get('/api/v1/admin/users').query({ q }));
        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(1);
        const [item] = res.body.data.items;
        expect(item).toMatchObject({
          id: customer.id,
          email: customer.email,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          bookingCount: 3,
          noShowCount: 1,
          upcomingBookingCount: 1,
        });
        expect(item.lastBookingAt).not.toBeNull();
        expect(item).not.toHaveProperty('passwordHash');
        expect(item).not.toHaveProperty('tokenVersion');
        expect(JSON.stringify(res.body)).not.toContain('$2');
      }
    });

    it('filters by role and status and bounds pagination', async () => {
      const admins = await asAdmin(
        request(app).get('/api/v1/admin/users').query({ role: 'ADMIN', limit: 100 }),
      );
      expect(admins.status).toBe(200);
      expect(admins.body.data.items.every((u: { role: string }) => u.role === 'ADMIN')).toBe(true);
      expect(admins.body.data.items.map((u: { id: string }) => u.id)).toContain(adminId);

      const locked = await asAdmin(
        request(app).get('/api/v1/admin/users').query({ status: 'LOCKED', limit: 100 }),
      );
      expect(locked.body.data.items.every((u: { status: string }) => u.status === 'LOCKED')).toBe(
        true,
      );

      const tooMany = await asAdmin(request(app).get('/api/v1/admin/users').query({ limit: 101 }));
      expect(tooMany.status).toBe(400);
      const unknown = await asAdmin(request(app).get('/api/v1/admin/users').query({ sort: 'x' }));
      expect(unknown.status).toBe(400);
    });

    it('excludes deleted/anonymized accounts from listings, status filters, search and total count (CWB-112)', async () => {
      const activeCustomer = await createCustomer('active-visible');
      const deletedCustomer = await createCustomer('deleted-hidden', '0933444555');

      const delRes = await request(app)
        .post('/api/v1/me/deletion')
        .set('Authorization', `Bearer ${deletedCustomer.token}`)
        .send({ currentPassword: password });
      expect(delRes.status).toBe(200);

      const allRes = await asAdmin(request(app).get('/api/v1/admin/users').query({ limit: 100 }));
      expect(allRes.status).toBe(200);
      const allIds = allRes.body.data.items.map((u: { id: string }) => u.id);
      expect(allIds).toContain(activeCustomer.id);
      expect(allIds).not.toContain(deletedCustomer.id);

      const activeFilterRes = await asAdmin(
        request(app).get('/api/v1/admin/users').query({ status: 'ACTIVE', limit: 100 }),
      );
      expect(activeFilterRes.status).toBe(200);
      expect(activeFilterRes.body.data.items.map((u: { id: string }) => u.id)).not.toContain(
        deletedCustomer.id,
      );

      for (const q of [
        'Tài khoản đã xóa',
        `deleted-${deletedCustomer.id}`,
        deletedCustomer.email,
      ]) {
        const searchRes = await asAdmin(
          request(app).get('/api/v1/admin/users').query({ q, limit: 100 }),
        );
        expect(searchRes.status).toBe(200);
        expect(searchRes.body.data.items.map((u: { id: string }) => u.id)).not.toContain(
          deletedCustomer.id,
        );
      }

      const exactAnonSearch = await asAdmin(
        request(app)
          .get('/api/v1/admin/users')
          .query({ q: `deleted-${deletedCustomer.id}` }),
      );
      expect(exactAnonSearch.status).toBe(200);
      expect(exactAnonSearch.body.data.pagination.total).toBe(0);
    });

    it('lazily evaluates ended unattended CONFIRMED bookings before counting noShowCount and preserves out-of-scope users (CWB-112)', async () => {
      const customer = await createCustomer('lazy-noshow');
      const otherCustomer = await createCustomer('other-noshow');
      const unattended = await prisma.booking.create({
        data: {
          bookingCode: `U79-${tag}-${++codeSeq}`,
          userId: customer.id,
          roomId,
          startTime: new Date(Date.now() - 3 * 3_600_000),
          endTime: new Date(Date.now() - 2 * 3_600_000),
          totalAmount: new Prisma.Decimal('100000.00'),
          status: BookingStatus.CONFIRMED,
          checkedInAt: null,
          attendanceTrackingEnabled: true,
        },
      });
      // Out-of-scope customer with an overdue unattended CONFIRMED booking must stay untouched.
      const otherUnattended = await prisma.booking.create({
        data: {
          bookingCode: `U79-${tag}-${++codeSeq}`,
          userId: otherCustomer.id,
          roomId,
          startTime: new Date(Date.now() - 3 * 3_600_000),
          endTime: new Date(Date.now() - 2 * 3_600_000),
          totalAmount: new Prisma.Decimal('100000.00'),
          status: BookingStatus.CONFIRMED,
          checkedInAt: null,
          attendanceTrackingEnabled: true,
        },
      });
      // Legacy / untracked booking must remain CONFIRMED and not inflate noShowCount.
      const untracked = await prisma.booking.create({
        data: {
          bookingCode: `U79-${tag}-${++codeSeq}`,
          userId: customer.id,
          roomId,
          startTime: new Date(Date.now() - 5 * 3_600_000),
          endTime: new Date(Date.now() - 4 * 3_600_000),
          totalAmount: new Prisma.Decimal('100000.00'),
          status: BookingStatus.CONFIRMED,
          checkedInAt: null,
          attendanceTrackingEnabled: false,
        },
      });

      // Empty scope and disjoint userId/scope.userIds must evaluate 0 rows.
      expect(
        await bookingRepository.evaluateNoShowBookings(new Date(), undefined, undefined, {
          userIds: [],
        }),
      ).toBe(0);
      expect(
        await bookingRepository.evaluateNoShowBookings(new Date(), customer.id, undefined, {
          userIds: [otherCustomer.id],
        }),
      ).toBe(0);

      const res = await asAdmin(
        request(app).get('/api/v1/admin/users').query({ q: customer.email }),
      );
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({
        id: customer.id,
        bookingCount: 2,
        noShowCount: 1,
        upcomingBookingCount: 0,
      });

      const storedUnattended = await prisma.booking.findUniqueOrThrow({
        where: { id: unattended.id },
      });
      const storedOtherUnattended = await prisma.booking.findUniqueOrThrow({
        where: { id: otherUnattended.id },
      });
      const storedUntracked = await prisma.booking.findUniqueOrThrow({
        where: { id: untracked.id },
      });
      expect(storedUnattended.status).toBe(BookingStatus.NO_SHOW);
      expect(storedOtherUnattended.status).toBe(BookingStatus.CONFIRMED);
      expect(storedUntracked.status).toBe(BookingStatus.CONFIRMED);
    });
  });

  describe('PATCH /admin/users/:id/status', () => {
    it('requires a reason and a valid status', async () => {
      const customer = await createCustomer('reason');
      expect((await setStatus(customer.id, { status: 'LOCKED' })).status).toBe(400);
      expect((await setStatus(customer.id, { status: 'LOCKED', reason: '   ' })).status).toBe(400);
      expect((await setStatus(customer.id, { status: 'BANNED', reason: 'x' })).status).toBe(400);
    });

    it('cannot lock itself or another admin, and 404s for an unknown account', async () => {
      for (const id of [adminId, otherAdminId]) {
        const res = await setStatus(id, { status: 'LOCKED', reason: 'thử' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ADMIN_ACCOUNT_PROTECTED');
      }
      const missing = await setStatus(randomUUID(), { status: 'LOCKED', reason: 'thử' });
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('USER_NOT_FOUND');
    });

    it('locks a customer: audit event, session revoked, login 403, bookings kept and listed', async () => {
      const customer = await createCustomer('lock');
      const upcoming = await insertBooking(customer.id, BookingStatus.CONFIRMED);
      expect((await login(customer.email)).status).toBe(200);

      const res = await setStatus(customer.id, { status: 'LOCKED', reason: '  Spam giữ chỗ  ' });

      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({
        id: customer.id,
        status: 'LOCKED',
        lockReason: 'Spam giữ chỗ',
        upcomingBookingCount: 1,
      });
      expect(res.body.data.affectedBookings).toEqual([
        expect.objectContaining({ id: upcoming.id, bookingCode: upcoming.bookingCode }),
      ]);
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: upcoming.id } })).status).toBe(
        BookingStatus.CONFIRMED,
      );

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { entityType: 'USER', entityId: customer.id, action: 'USER_LOCKED' },
      });
      expect(audit.actorId).toBe(adminId);
      expect(audit.after).toMatchObject({ status: 'LOCKED', reason: 'Spam giữ chỗ' });

      // A token issued before the lock is rejected on the next request.
      const me = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${customer.token}`);
      expect(me.status).toBe(401);

      const locked = await login(customer.email);
      expect(locked.status).toBe(403);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');
      expect(locked.body).not.toHaveProperty('data');

      // Wrong password still answers 401 and does not reveal the lock.
      const wrong = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: customer.email, password: 'Wrong-password1' });
      expect(wrong.status).toBe(401);

      const again = await setStatus(customer.id, { status: 'LOCKED', reason: 'lần nữa' });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('USER_STATUS_UNCHANGED');
    });

    it('rejects booking creation for a locked account inside the booking transaction', async () => {
      const customer = await createCustomer('race');
      expect((await setStatus(customer.id, { status: 'LOCKED', reason: 'Lạm dụng' })).status).toBe(
        200,
      );
      const { start, end } = nextSlot();
      // Simulates a request that passed authentication just before the lock was committed.
      await expect(
        bookingRepository.createBooking({
          userId: customer.id,
          roomId,
          bookingCode: `U79-${tag}-race`,
          startDate: start,
          endDate: end,
          durationMinutes: 60,
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 403 });
      expect(await prisma.booking.count({ where: { userId: customer.id } })).toBe(0);
    });

    it('unlocks a customer with a reason so they can log in again', async () => {
      const customer = await createCustomer('unlock');
      await setStatus(customer.id, { status: 'LOCKED', reason: 'Tạm khóa' });

      const res = await setStatus(customer.id, { status: 'ACTIVE', reason: 'Đã xác minh' });
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({ status: 'ACTIVE', lockReason: null });
      expect(res.body.data.affectedBookings).toEqual([]);
      expect((await login(customer.email)).status).toBe(200);
      expect(
        await prisma.auditEvent.count({
          where: { entityType: 'USER', entityId: customer.id, action: 'USER_UNLOCKED' },
        }),
      ).toBe(1);
    });

    it('rejects locking or unlocking a deleted account with 404 USER_NOT_FOUND and writes no audit event (CWB-112)', async () => {
      const customer = await createCustomer('deleted-lock');
      const delRes = await request(app)
        .post('/api/v1/me/deletion')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ currentPassword: password });
      expect(delRes.status).toBe(200);

      for (const status of ['LOCKED', 'ACTIVE'] as const) {
        const res = await setStatus(customer.id, {
          status,
          reason: 'Thử cập nhật trạng thái tài khoản đã xóa',
        });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('USER_NOT_FOUND');
      }

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
      expect(stored.deletedAt).not.toBeNull();
      expect(stored.lockedAt).toBeNull();
      expect(stored.lockReason).toBeNull();
      expect(
        await prisma.auditEvent.count({
          where: { entityType: 'USER', entityId: customer.id },
        }),
      ).toBe(0);
    });

    it('lazily evaluates noShowCount in updateStatus response (CWB-112)', async () => {
      const customer = await createCustomer('lock-lazy-noshow');
      await prisma.booking.create({
        data: {
          bookingCode: `U79-${tag}-${++codeSeq}`,
          userId: customer.id,
          roomId,
          startTime: new Date(Date.now() - 3 * 3_600_000),
          endTime: new Date(Date.now() - 2 * 3_600_000),
          totalAmount: new Prisma.Decimal('100000.00'),
          status: BookingStatus.CONFIRMED,
          checkedInAt: null,
          attendanceTrackingEnabled: true,
        },
      });

      const res = await setStatus(customer.id, {
        status: 'LOCKED',
        reason: 'Khóa khách bỏ lịch',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({
        id: customer.id,
        status: 'LOCKED',
        bookingCount: 1,
        noShowCount: 1,
      });
    });

    it('rejects booking reschedule for a locked account inside the reschedule transaction (CWB-112)', async () => {
      const customer = await createCustomer('reschedule-locked');
      const originalSlot = nextSlot();
      const targetSlot = nextSlot();
      const booking = await insertBooking(customer.id, BookingStatus.CONFIRMED, originalSlot);

      expect((await setStatus(customer.id, { status: 'LOCKED', reason: 'Lạm dụng' })).status).toBe(
        200,
      );

      await expect(
        bookingRepository.rescheduleBooking(customer.id, booking.id, {
          roomId,
          startTime: targetSlot.start.toISOString(),
          endTime: targetSlot.end.toISOString(),
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 403 });

      const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(stored.startTime.toISOString()).toBe(originalSlot.start.toISOString());
    });

    it('serializes concurrent admin lock and reschedule so reschedule either commits before lock or rejects 403 ACCOUNT_LOCKED (CWB-112 / F-08)', async () => {
      const customer = await createCustomer('reschedule-lock-race');
      const originalSlot = nextSlot();
      const targetSlot = nextSlot();
      const booking = await insertBooking(customer.id, BookingStatus.CONFIRMED, originalSlot);

      const [lockResult, rescheduleResult] = await Promise.allSettled([
        adminUserRepository.updateStatus({
          userId: customer.id,
          status: 'LOCKED',
          reason: 'Khóa đồng thời với đổi lịch',
          actor: { id: adminId, role: Role.ADMIN },
          now: new Date(),
        }),
        bookingRepository.rescheduleBooking(customer.id, booking.id, {
          roomId,
          startTime: targetSlot.start.toISOString(),
          endTime: targetSlot.end.toISOString(),
        }),
      ]);

      expect(lockResult.status).toBe('fulfilled');
      if (lockResult.status === 'fulfilled') {
        expect(lockResult.value.affectedBookings.map((b) => b.id)).toContain(booking.id);
      }

      const storedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      const storedUser = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
      expect(storedUser.lockedAt).not.toBeNull();

      if (rescheduleResult.status === 'rejected') {
        expect(rescheduleResult.reason).toMatchObject({
          code: 'ACCOUNT_LOCKED',
          statusCode: 403,
        });
        expect(storedBooking.startTime.toISOString()).toBe(originalSlot.start.toISOString());
      } else {
        expect(storedBooking.startTime.toISOString()).toBe(targetSlot.start.toISOString());
      }
    });
  });

  describe('GET /admin/bookings?customer=', () => {
    it('finds bookings by customer email, name or phone, including walk-in guests', async () => {
      const customer = await createCustomer('bookings', '0987000111');
      const own = await insertBooking(customer.id, BookingStatus.CONFIRMED);
      const guestPhone = `09${tag.replace(/\D/g, '').padEnd(8, '7').slice(0, 8)}`;
      const guest = await insertBooking(null, BookingStatus.CONFIRMED, nextSlot(), {
        guestName: `Vãng lai ${tag}`,
        guestPhone,
      });

      const search = async (customerQuery: string) => {
        const res = await asAdmin(
          request(app).get('/api/v1/admin/bookings').query({ customer: customerQuery, limit: 100 }),
        );
        expect(res.status).toBe(200);
        return res.body.data.items.map((b: { id: string }) => b.id);
      };

      expect(await search(customer.email)).toEqual([own.id]);
      expect(await search(`bookings ${tag}`)).toEqual([own.id]);
      expect(await search('0987000111')).toEqual([own.id]);
      expect(await search(`Vãng lai ${tag}`)).toEqual([guest.id]);
      expect(await search(guestPhone)).toContain(guest.id);
    });
  });
});
