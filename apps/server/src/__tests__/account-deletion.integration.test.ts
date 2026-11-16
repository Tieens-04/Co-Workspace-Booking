import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { BookingStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { hashPassword } from '../utils/password.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { changePasswordRateLimiter } from '../middlewares/rate-limit.middleware.js';
import { adminUserRepository } from '../repositories/admin-user.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import {
  emailVerificationRepository,
  hashVerificationToken,
} from '../repositories/email-verification.repository.js';
import {
  ANONYMIZED_FULL_NAME,
  ANONYMIZED_PASSWORD_HASH,
  userRepository,
} from '../repositories/user.repository.js';
import { emailVerificationService } from '../services/email-verification.service.js';
import { meService } from '../services/me.service.js';
import { EmailOutboxService } from '../services/email-outbox.service.js';
import { NotificationService } from '../services/notification.service.js';
import { TestAccounts } from './support/test-accounts.js';

const DELETION_URL = '/api/v1/me/deletion';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 10:00 Asia/Ho_Chi_Minh (03:00Z), `days` days from now: slot aligned and far from "now". */
const futureSlot = (days: number, hours = 1) => {
  const start = new Date(Date.now() + days * DAY);
  start.setUTCHours(3, 0, 0, 0);
  return { start, end: new Date(start.getTime() + hours * HOUR) };
};

describe('Account deletion / anonymization POST /api/v1/me/deletion (CWB-88, real MySQL)', () => {
  const prefix = `test_delete_${randomUUID()}`;
  const password = 'Password123!';
  const admins = new TestAccounts();
  const adminToken = admins.token(Role.ADMIN);
  const userIds: string[] = [];
  let roomId: string;
  let codeSeq = 0;

  const bookingCode = () => {
    codeSeq += 1;
    return `CS-29991231-${randomUUID().slice(0, 4).toUpperCase()}${codeSeq}`.slice(0, 20);
  };

  const createCustomer = async (role: Role = Role.CUSTOMER) => {
    const email = `${prefix}_${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        fullName: 'Nguyễn Văn Xóa',
        phoneNumber: '0901234567',
        role,
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(user.id);
    return { user, token: generateToken({ sub: user.id, role: user.role, tv: user.tokenVersion }) };
  };

  const createBooking = (
    userId: string,
    data: {
      start: Date;
      end: Date;
      status: BookingStatus;
      paymentStatus?: PaymentStatus;
      paymentMethod?: PaymentMethod | null;
    },
  ) =>
    prisma.booking.create({
      data: {
        bookingCode: bookingCode(),
        userId,
        roomId,
        startTime: data.start,
        endTime: data.end,
        totalAmount: '150000.00',
        status: data.status,
        paymentStatus: data.paymentStatus ?? PaymentStatus.UNPAID,
        paymentMethod: data.paymentMethod ?? null,
      },
    });

  const deleteAccount = (token: string, body: object = { currentPassword: password }) =>
    request(app).post(DELETION_URL).set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    await admins.persist();
    const room = await prisma.room.create({
      data: {
        name: `${prefix}_room`,
        capacity: 4,
        pricePerHour: '150000.00',
        status: 'AVAILABLE',
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    await admins.cleanup();
    await prisma.booking.deleteMany({ where: { roomId } });
    await prisma.emailOutbox.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditEvent.deleteMany({ where: { entityId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.room.deleteMany({ where: { id: roomId } });
  });

  it('requires authentication', async () => {
    const res = await request(app).post(DELETION_URL).send({ currentPassword: password });
    expect(res.status).toBe(401);
  });

  it('rejects a missing password or extra fields with 400 before touching the account', async () => {
    const { user, token } = await createCustomer();
    for (const body of [{}, { currentPassword: '' }, { currentPassword: password, userId: 'x' }]) {
      const res = await deleteAccount(token, body);
      expect(res.status).toBe(400);
    }
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.deletedAt).toBeNull();
    expect(stored.email).toBe(user.email);
  });

  it('rejects a wrong password with 400 and keeps the account and session', async () => {
    const { user, token } = await createCustomer();
    changePasswordRateLimiter.resetKey(`user:${user.id}`);

    const res = await deleteAccount(token, { currentPassword: 'WrongPassword1!' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CURRENT_PASSWORD');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored).toMatchObject({ email: user.email, deletedAt: null, tokenVersion: 0 });
    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
  });

  it('forbids admins from deleting their own account here (403)', async () => {
    const { user, token } = await createCustomer(Role.ADMIN);
    const res = await deleteAccount(token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DELETION_FORBIDDEN');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.deletedAt).toBeNull();
  });

  it('blocks deletion with 409 and lists every upcoming or ongoing CONFIRMED booking', async () => {
    const { user, token } = await createCustomer();
    const upcoming = await createBooking(user.id, {
      ...futureSlot(3),
      status: BookingStatus.CONFIRMED,
    });
    const ongoingStart = new Date(Date.now() - HOUR);
    const ongoing = await createBooking(user.id, {
      start: ongoingStart,
      end: new Date(ongoingStart.getTime() + 3 * HOUR),
      status: BookingStatus.CONFIRMED,
    });
    // Cancelled or finished bookings never block.
    await createBooking(user.id, { ...futureSlot(4), status: BookingStatus.CANCELLED });

    const res = await deleteAccount(token);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACCOUNT_HAS_ACTIVE_BOOKINGS');
    const codes = (res.body.details.bookings as Array<{ bookingCode: string }>).map(
      (b) => b.bookingCode,
    );
    expect(codes.sort()).toEqual([upcoming.bookingCode, ongoing.bookingCode].sort());
    expect(res.body.details.bookings[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        roomName: `${prefix}_room`,
        startTime: expect.any(String),
        endTime: expect.any(String),
      }),
    );
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored).toMatchObject({ email: user.email, deletedAt: null });

    await prisma.booking.deleteMany({ where: { userId: user.id } });
  });

  it('anonymizes the account, ends every session and keeps bookings, revenue and audit', async () => {
    const { user, token } = await createCustomer();
    const pastStart = new Date(Date.now() - 10 * DAY);
    pastStart.setUTCHours(3, 0, 0, 0);
    const paid = await createBooking(user.id, {
      start: pastStart,
      end: new Date(pastStart.getTime() + 2 * HOUR),
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.CASH,
    });
    const cancelled = await createBooking(user.id, {
      ...futureSlot(5),
      status: BookingStatus.CANCELLED,
    });
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + HOUR) },
    });
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash: 'b'.repeat(64), expiresAt: new Date(Date.now() + HOUR) },
    });
    const pendingAccountMail = await prisma.emailOutbox.create({
      data: { kind: 'EMAIL_VERIFICATION', userId: user.id },
    });
    const pendingBookingMail = await prisma.emailOutbox.create({
      data: { kind: 'BOOKING_CANCELLATION', bookingId: cancelled.id },
    });
    const sentMail = await prisma.emailOutbox.create({
      data: {
        kind: 'BOOKING_CONFIRMATION',
        bookingId: paid.id,
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    const auditBefore = await prisma.auditEvent.count();

    const revenueUrl = `/api/v1/admin/revenue?roomId=${roomId}`;
    const revenueBefore = await request(app)
      .get(revenueUrl)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revenueBefore.status).toBe(200);

    const res = await deleteAccount(token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(user.email);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.deletedAt).toBeInstanceOf(Date);
    expect(stored.email).not.toBe(user.email);
    expect(stored.email).not.toContain(prefix);
    expect(stored.email).toMatch(/@deleted\.invalid$/);
    expect(stored.fullName).not.toContain('Nguyễn Văn Xóa');
    expect(stored.phoneNumber).toBeNull();
    expect(stored.passwordHash).not.toBe(user.passwordHash);
    expect(stored.passwordHash.startsWith('$2')).toBe(false);
    expect(stored.emailVerifiedAt).toBeNull();
    expect(stored.tokenVersion).toBe(1);

    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.emailVerificationToken.count({ where: { userId: user.id } })).toBe(0);

    // Pending mail is cancelled; already delivered history stays as it was.
    const outbox = await prisma.emailOutbox.findMany({
      where: { id: { in: [pendingAccountMail.id, pendingBookingMail.id, sentMail.id] } },
    });
    const byId = new Map(outbox.map((row) => [row.id, row]));
    expect(byId.get(pendingAccountMail.id)).toMatchObject({
      status: 'SKIPPED',
      lastError: 'ACCOUNT_DELETED',
    });
    expect(byId.get(pendingBookingMail.id)).toMatchObject({
      status: 'SKIPPED',
      lastError: 'ACCOUNT_DELETED',
    });
    expect(byId.get(sentMail.id)?.status).toBe('SENT');

    // Bookings, revenue and the audit trail are untouched.
    const bookings = await prisma.booking.findMany({ where: { userId: user.id } });
    expect(bookings).toHaveLength(2);
    const storedPaid = bookings.find((b) => b.id === paid.id)!;
    expect(storedPaid).toMatchObject({
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      bookingCode: paid.bookingCode,
    });
    expect(storedPaid.totalAmount.toFixed(2)).toBe('150000.00');
    const revenueAfter = await request(app)
      .get(revenueUrl)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revenueAfter.body.data).toEqual(revenueBefore.body.data);
    expect(await prisma.auditEvent.count()).toBe(auditBefore);

    // Every earlier token is dead and the old credentials no longer sign in.
    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password });
    expect(login.status).toBe(401);
    expect(login.body.code).toBe('INVALID_CREDENTIALS');
    const loginAnonymized = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: stored.email, password });
    expect(loginAnonymized.status).toBe(401);

    // A fresh token at the new version is still rejected for a deleted account.
    const fresh = generateToken({ sub: user.id, role: user.role, tv: stored.tokenVersion });
    const meFresh = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${fresh}`);
    expect(meFresh.status).toBe(401);
  });

  it('frees the original email so it can register a new account', async () => {
    const { user, token } = await createCustomer();
    expect((await deleteAccount(token)).status).toBe(200);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: user.email, password, fullName: 'Khách mới' });
    expect(res.status).toBe(201);
    userIds.push(res.body.data.id);
    expect(res.body.data.id).not.toBe(user.id);
  });

  it('never sends an email to a deleted account, even when an admin requeues it', async () => {
    const { user, token } = await createCustomer();
    const mail = await prisma.emailOutbox.create({
      data: { kind: 'EMAIL_VERIFICATION', userId: user.id },
    });
    expect((await deleteAccount(token)).status).toBe(200);

    await prisma.emailOutbox.update({
      where: { id: mail.id },
      data: { status: 'QUEUED', attempts: 0, nextAttemptAt: new Date(0), lastError: null },
    });
    const notification = new NotificationService();
    vi.spyOn(notification, 'canDeliver').mockReturnValue(true);
    const send = vi.spyOn(notification, 'sendEmailVerification').mockResolvedValue(true);
    const worker = new EmailOutboxService(notification);

    // Other suites' queued rows may be claimed too; only this row is asserted.
    for (let pass = 0; pass < 20; pass++) {
      const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } });
      if (row.status !== 'QUEUED') break;
      await worker.processDue(new Date(), 50);
    }

    const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } });
    expect(row).toMatchObject({ status: 'SKIPPED', lastError: 'ACCOUNT_DELETED' });
    // Rows of other accounts (other tests) may legitimately be delivered by the same pass.
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ reference: user.id }));
    for (const [message] of send.mock.calls) {
      expect(message.recipientEmail).not.toMatch(/@deleted\.invalid$/);
    }
  });

  it('rejects a booking for an account deleted while the request was in flight', async () => {
    const { user, token } = await createCustomer();
    expect((await deleteAccount(token)).status).toBe(200);
    const { start, end } = futureSlot(6);

    await expect(
      bookingRepository.createBooking({
        userId: user.id,
        roomId,
        bookingCode: bookingCode(),
        startDate: start,
        endDate: end,
        durationMinutes: 60,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(await prisma.booking.count({ where: { userId: user.id } })).toBe(0);
  });

  it('never lets a racing booking and deletion both succeed', async () => {
    for (let round = 0; round < 3; round++) {
      const { user } = await createCustomer();
      const { start, end } = futureSlot(7 + round);

      const [booking, deletion] = await Promise.allSettled([
        bookingRepository.createBooking({
          userId: user.id,
          roomId,
          bookingCode: bookingCode(),
          startDate: start,
          endDate: end,
          durationMinutes: 60,
        }),
        meService.deleteAccount(user.id, { currentPassword: password }),
      ]);

      const succeeded = [booking, deletion].filter((r) => r.status === 'fulfilled');
      expect(succeeded).toHaveLength(1);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const confirmed = await prisma.booking.count({
        where: { userId: user.id, status: BookingStatus.CONFIRMED },
      });
      if (deletion.status === 'fulfilled') {
        expect(stored.deletedAt).not.toBeNull();
        expect(confirmed).toBe(0);
      } else {
        expect(deletion.reason).toMatchObject({ statusCode: 409 });
        expect(stored.deletedAt).toBeNull();
        expect(confirmed).toBe(1);
      }
    }
  });

  it('rejects account deletion for a locked customer under row lock with 403 ACCOUNT_LOCKED and preserves lock state (CWB-112)', async () => {
    const { user } = await createCustomer();
    const lockedAt = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedAt, lockReason: 'Khóa do vi phạm nội quy' },
    });

    const repoResult = await userRepository.anonymizeAccount(user.id, new Date());
    expect(repoResult).toEqual({ status: 'LOCKED' });

    await expect(
      meService.deleteAccount(user.id, { currentPassword: password }),
    ).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
      statusCode: 403,
    });

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.deletedAt).toBeNull();
    expect(stored.email).toBe(user.email);
    expect(stored.lockedAt).not.toBeNull();
    expect(stored.lockReason).toBe('Khóa do vi phạm nội quy');
  });

  it('never lets a racing admin lock and customer account deletion both succeed (CWB-112)', async () => {
    const adminActorId = randomUUID();
    for (let round = 0; round < 3; round++) {
      const { user } = await createCustomer();

      const [lockResult, deletion] = await Promise.allSettled([
        adminUserRepository.updateStatus({
          userId: user.id,
          status: 'LOCKED',
          reason: 'Khóa khẩn cấp',
          actor: { id: adminActorId, role: Role.ADMIN },
          now: new Date(),
        }),
        meService.deleteAccount(user.id, { currentPassword: password }),
      ]);

      const succeeded = [lockResult, deletion].filter((r) => r.status === 'fulfilled');
      expect(succeeded).toHaveLength(1);

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (deletion.status === 'fulfilled') {
        expect(lockResult.status).toBe('rejected');
        if (lockResult.status === 'rejected') {
          expect(lockResult.reason).toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
        }
        expect(stored.deletedAt).not.toBeNull();
        expect(stored.lockedAt).toBeNull();
      } else {
        expect(deletion.reason).toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 403 });
        expect(stored.deletedAt).toBeNull();
        expect(stored.lockedAt).not.toBeNull();
        expect(stored.email).toBe(user.email);
      }
    }
  });

  it('rejects booking reschedule for an account deleted while the request was in flight (CWB-112)', async () => {
    const { user, token } = await createCustomer();
    expect((await deleteAccount(token)).status).toBe(200);

    const originalSlot = futureSlot(12);
    const targetSlot = futureSlot(13);
    const booking = await createBooking(user.id, {
      ...originalSlot,
      status: BookingStatus.CONFIRMED,
    });

    await expect(
      bookingRepository.rescheduleBooking(user.id, booking.id, {
        roomId,
        startTime: targetSlot.start.toISOString(),
        endTime: targetSlot.end.toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 });

    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.startTime.toISOString()).toBe(originalSlot.start.toISOString());
  });

  it('rejects issuing and consuming email verification tokens for deleted or locked accounts under row lock (CWB-112)', async () => {
    // 1. Deleted account
    const { user: deletedUser, token: deletedUserToken } = await createCustomer();
    await prisma.user.update({
      where: { id: deletedUser.id },
      data: { emailVerifiedAt: null },
    });
    expect((await deleteAccount(deletedUserToken)).status).toBe(200);

    expect(await emailVerificationRepository.issueToken(deletedUser.id)).toEqual({
      status: 'ACCOUNT_DELETED',
    });
    await emailVerificationService.resendVerification(deletedUser.id);
    expect(await prisma.emailOutbox.count({ where: { userId: deletedUser.id } })).toBe(0);

    const syntheticDeletedToken = 'a'.repeat(43);
    await prisma.emailVerificationToken.create({
      data: {
        userId: deletedUser.id,
        tokenHash: hashVerificationToken(syntheticDeletedToken),
        expiresAt: new Date(Date.now() + HOUR),
      },
    });
    const verifyDeletedRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: syntheticDeletedToken });
    expect(verifyDeletedRes.status).toBe(400);
    expect(verifyDeletedRes.body.code).toBe('INVALID_VERIFICATION_TOKEN');

    // 2. Locked account
    const { user: lockedUser } = await createCustomer();
    await prisma.user.update({
      where: { id: lockedUser.id },
      data: { emailVerifiedAt: null },
    });
    const issuedBeforeLock = await emailVerificationRepository.issueToken(lockedUser.id);
    expect(issuedBeforeLock.status).toBe('ISSUED');
    if (issuedBeforeLock.status !== 'ISSUED') throw new Error('Expected ISSUED');

    const queuedMail = await prisma.emailOutbox.create({
      data: { kind: 'EMAIL_VERIFICATION', userId: lockedUser.id },
    });

    await prisma.user.update({
      where: { id: lockedUser.id },
      data: { lockedAt: new Date(), lockReason: 'Spam xác thực' },
    });

    expect(await emailVerificationRepository.issueToken(lockedUser.id)).toEqual({
      status: 'ACCOUNT_LOCKED',
    });

    await emailVerificationService.resendVerification(lockedUser.id);
    expect(await prisma.emailOutbox.count({ where: { userId: lockedUser.id } })).toBe(1);

    const verifyLockedRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: issuedBeforeLock.token });
    expect(verifyLockedRes.status).toBe(400);
    expect(verifyLockedRes.body.code).toBe('INVALID_VERIFICATION_TOKEN');

    const storedLockedUser = await prisma.user.findUniqueOrThrow({ where: { id: lockedUser.id } });
    expect(storedLockedUser.emailVerifiedAt).toBeNull();

    const notification = new NotificationService();
    vi.spyOn(notification, 'canDeliver').mockReturnValue(true);
    const sendSpy = vi.spyOn(notification, 'sendEmailVerification').mockResolvedValue(true);
    const worker = new EmailOutboxService(notification);

    for (let pass = 0; pass < 20; pass++) {
      const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: queuedMail.id } });
      if (row.status !== 'QUEUED') break;
      await worker.processDue(new Date(), 50);
    }

    const processedMail = await prisma.emailOutbox.findUniqueOrThrow({
      where: { id: queuedMail.id },
    });
    expect(processedMail).toMatchObject({ status: 'SKIPPED', lastError: 'ACCOUNT_LOCKED' });
    expect(sendSpy).not.toHaveBeenCalledWith(expect.objectContaining({ reference: lockedUser.id }));

    // 3. Post-claim race fallback inside EmailOutboxService.deliverVerification (F-02)
    const { user: raceUser } = await createCustomer();
    await prisma.user.update({
      where: { id: raceUser.id },
      data: { emailVerifiedAt: null },
    });
    for (const simulatedStatus of ['ACCOUNT_LOCKED', 'ACCOUNT_DELETED'] as const) {
      const raceMail = await prisma.emailOutbox.create({
        data: { kind: 'EMAIL_VERIFICATION', userId: raceUser.id },
      });
      const issueSpy = vi
        .spyOn(emailVerificationRepository, 'issueToken')
        .mockResolvedValue({ status: simulatedStatus });
      try {
        for (let pass = 0; pass < 20; pass++) {
          const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: raceMail.id } });
          if (row.status !== 'QUEUED') break;
          await worker.processDue(new Date(), 50);
        }
      } finally {
        issueSpy.mockRestore();
      }
      const resultMail = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: raceMail.id } });
      expect(resultMail).toMatchObject({ status: 'SKIPPED', lastError: simulatedStatus });
    }
    expect(sendSpy).not.toHaveBeenCalledWith(expect.objectContaining({ reference: raceUser.id }));
  });

  it('rejects /me profile, password, and session mutations on deleted or locked accounts and prevents TOCTOU overwrite (CWB-112 / F-01)', async () => {
    // 1. Deleted account cannot be overwritten by late /me mutations
    const { user: deletedUser, token: deletedToken } = await createCustomer();
    expect((await deleteAccount(deletedToken)).status).toBe(200);

    await expect(meService.getProfile(deletedUser.id)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });
    await expect(
      meService.updateProfile(deletedUser.id, {
        fullName: 'Hồi Sinh PII',
        phoneNumber: '0911222333',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 });
    await expect(
      meService.changePassword(deletedUser.id, {
        currentPassword: password,
        newPassword: 'Resurrected123!',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 });
    await expect(meService.logoutAll(deletedUser.id)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });

    const storedDeleted = await prisma.user.findUniqueOrThrow({ where: { id: deletedUser.id } });
    expect(storedDeleted.fullName).toBe(ANONYMIZED_FULL_NAME);
    expect(storedDeleted.phoneNumber).toBeNull();
    expect(storedDeleted.passwordHash).toBe(ANONYMIZED_PASSWORD_HASH);
    expect(storedDeleted.tokenVersion).toBe(1);

    // 2. Locked account rejects updateProfile and changePassword (only after correct password)
    const { user: lockedUser } = await createCustomer();
    const originalHash = lockedUser.passwordHash;
    await prisma.user.update({
      where: { id: lockedUser.id },
      data: { lockedAt: new Date(), lockReason: 'Khóa tạm thời' },
    });

    await expect(meService.getProfile(lockedUser.id)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });
    await expect(meService.logoutAll(lockedUser.id)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });
    await expect(
      meService.updateProfile(lockedUser.id, { fullName: 'Sửa Khi Đang Khóa' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 403 });
    await expect(
      meService.changePassword(lockedUser.id, {
        currentPassword: 'WrongPassword1!',
        newPassword: 'ChangedLocked1!',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CURRENT_PASSWORD', statusCode: 400 });
    await expect(
      meService.changePassword(lockedUser.id, {
        currentPassword: password,
        newPassword: 'ChangedLocked1!',
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 403 });

    const storedLocked = await prisma.user.findUniqueOrThrow({ where: { id: lockedUser.id } });
    expect(storedLocked.fullName).toBe('Nguyễn Văn Xóa');
    expect(storedLocked.passwordHash).toBe(originalHash);
    expect(storedLocked.tokenVersion).toBe(0);

    // 3. Concurrent race: changePassword vs deleteAccount never writes bcrypt hash onto deleted row
    for (let round = 0; round < 3; round++) {
      const { user } = await createCustomer();
      const [changeRes, deleteRes] = await Promise.allSettled([
        meService.changePassword(user.id, {
          currentPassword: password,
          newPassword: 'RacingPassword1!',
        }),
        meService.deleteAccount(user.id, { currentPassword: password }),
      ]);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (stored.deletedAt !== null) {
        expect(deleteRes.status).toBe('fulfilled');
        expect(stored.passwordHash).toBe(ANONYMIZED_PASSWORD_HASH);
        expect(stored.fullName).toBe(ANONYMIZED_FULL_NAME);
        expect(stored.phoneNumber).toBeNull();
      } else {
        expect(changeRes.status).toBe('fulfilled');
        expect(deleteRes.status).toBe('rejected');
      }
    }

    // 4. Concurrent race: updateProfile vs deleteAccount never leaves real PII on a deleted row
    for (let round = 0; round < 3; round++) {
      const { user } = await createCustomer();
      await Promise.allSettled([
        meService.updateProfile(user.id, {
          fullName: 'Tên Sau Khi Xóa',
          phoneNumber: '0988777666',
        }),
        meService.deleteAccount(user.id, { currentPassword: password }),
      ]);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (stored.deletedAt !== null) {
        expect(stored.fullName).toBe(ANONYMIZED_FULL_NAME);
        expect(stored.phoneNumber).toBeNull();
      }
    }

    // 5. Concurrent race: changePassword vs admin lock never leaves a live session token on locked account
    const adminActorId = randomUUID();
    for (let round = 0; round < 3; round++) {
      const { user } = await createCustomer();
      const [changeRes, lockRes] = await Promise.allSettled([
        meService.changePassword(user.id, {
          currentPassword: password,
          newPassword: 'RacingLockPass1!',
        }),
        adminUserRepository.updateStatus({
          userId: user.id,
          status: 'LOCKED',
          reason: 'Khóa đua song song',
          actor: { id: adminActorId, role: Role.ADMIN },
          now: new Date(),
        }),
      ]);
      expect(lockRes.status).toBe('fulfilled');
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.lockedAt).not.toBeNull();
      if (changeRes.status === 'rejected') {
        expect(changeRes.reason).toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 403 });
        expect(stored.tokenVersion).toBe(1);
      } else {
        // changePassword committed before updateStatus acquired row lock -> updateStatus bumped tokenVersion again
        expect(stored.tokenVersion).toBe(2);
        const staleMe = await request(app)
          .get('/api/v1/me')
          .set('Authorization', `Bearer ${changeRes.value.accessToken}`);
        expect(staleMe.status).toBe(401);
      }
    }
  });
});
