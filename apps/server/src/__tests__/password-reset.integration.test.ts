import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { comparePassword, hashPassword } from '../utils/password.util.js';
import { drainBackgroundTasks } from '../utils/background-tasks.util.js';
import { notificationService } from '../services/notification.service.js';
import { passwordResetRepository } from '../repositories/password-reset.repository.js';
import {
  hashResetToken,
  passwordResetService,
  RESET_TOKEN_TTL_MINUTES,
} from '../services/password-reset.service.js';
import {
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
} from '../middlewares/rate-limit.middleware.js';

describe('Password reset (CWB-64, real MySQL)', () => {
  const prefix = `test_reset_${randomUUID()}`;
  const password = 'Password123!';
  const newPassword = 'BrandNew456!';
  const emails: string[] = [];
  const userIds: string[] = [];
  let sentUrls: string[];

  const createUser = async () => {
    const email = `${prefix}_${randomUUID()}@example.com`;
    emails.push(email);
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), fullName: 'Người dùng reset' },
    });
    userIds.push(user.id);
    return user;
  };
  const tokenFromLastEmail = () => new URL(sentUrls.at(-1)!).searchParams.get('token')!;
  const resetLimits = async () => {
    for (const address of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
      const key = ipKeyGenerator(address, 56);
      await forgotPasswordRateLimiter.resetKey(key);
      await resetPasswordRateLimiter.resetKey(key);
    }
  };

  beforeEach(async () => {
    sentUrls = [];
    await resetLimits();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(notificationService, 'canDeliver').mockReturnValue(true);
    vi.spyOn(notificationService, 'sendPasswordReset').mockImplementation(async (payload) => {
      sentUrls.push(payload.resetUrl);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { OR: [{ email: { in: emails } }, { id: { in: userIds } }] },
    });
  });

  it('answers identically for registered and unknown emails and emails only real accounts', async () => {
    const user = await createUser();

    const known = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email.toUpperCase() });
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: `${prefix}_nobody@example.com` });
    await drainBackgroundTasks(5000);

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(sentUrls).toHaveLength(1);
    expect(sentUrls[0]).toMatch(/\/reset-password\?token=[A-Za-z0-9_-]{43}$/);
  });

  it('stores only a hash with a 30-minute expiry, resets once and rejects replay', async () => {
    const user = await createUser();
    const before = Date.now();
    await passwordResetService.issueAndSend(user.email);
    const token = tokenFromLastEmail();

    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).toBe(hashResetToken(token));
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      RESET_TOKEN_TTL_MINUTES * 60_000 - 1000,
    );
    expect(stored.expiresAt.getTime() - before).toBeLessThanOrEqual(
      RESET_TOKEN_TTL_MINUTES * 60_000 + 5000,
    );

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword });
    expect(reset.status).toBe(200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await comparePassword(newPassword, updated.passwordHash)).toBe(true);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: newPassword });
    expect(login.status).toBe(200);

    const replay = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'Another789!' });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('INVALID_RESET_TOKEN');
  });

  it('revokes every JWT issued before the reset (CWB-77)', async () => {
    const user = await createUser();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password });
    expect(login.status).toBe(200);
    const stolen = login.body.data.accessToken as string;
    const me = (token: string) =>
      request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    expect((await me(stolen)).status).toBe(200);

    await passwordResetService.issueAndSend(user.email);
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: tokenFromLastEmail(), newPassword });
    expect(reset.status).toBe(200);

    const denied = await me(stolen);
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe('UNAUTHORIZED');
    const fresh = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: newPassword });
    expect((await me(fresh.body.data.accessToken)).status).toBe(200);
  });

  it('rejects an expired token', async () => {
    const user = await createUser();
    await passwordResetService.issueAndSend(user.email, new Date(Date.now() - 31 * 60_000));

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: tokenFromLastEmail(), newPassword });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_TOKEN');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await comparePassword(password, stored.passwordHash)).toBe(true);
  });

  it('lets exactly one of two concurrent resets with the same token succeed', async () => {
    const user = await createUser();
    await passwordResetService.issueAndSend(user.email);
    const token = tokenFromLastEmail();

    const results = await Promise.all([
      request(app).post('/api/v1/auth/reset-password').send({ token, newPassword }),
      request(app).post('/api/v1/auth/reset-password').send({ token, newPassword: 'Other789!!' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it('preserves unexpired earlier links when a subsequent request fails SMTP or succeeds, and deletes all unused links once consumed (CWB-112)', async () => {
    // 1. Transient SMTP failure on 2nd request must NOT break the 1st delivered link
    const user1 = await createUser();
    await passwordResetService.issueAndSend(user1.email);
    const firstDelivered = tokenFromLastEmail();

    vi.mocked(notificationService.sendPasswordReset).mockResolvedValueOnce(false);
    await passwordResetService.issueAndSend(user1.email);

    expect(
      await prisma.passwordResetToken.count({ where: { userId: user1.id, usedAt: null } }),
    ).toBe(1);

    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token: firstDelivered, newPassword })
      ).status,
    ).toBe(200);

    // 2. Two delivered links both stay usable until one is consumed, which cleans up all remaining unused tokens
    const user2 = await createUser();
    await passwordResetService.issueAndSend(user2.email);
    const link1 = tokenFromLastEmail();
    await passwordResetService.issueAndSend(user2.email);
    const link2 = tokenFromLastEmail();

    expect(
      await prisma.passwordResetToken.count({ where: { userId: user2.id, usedAt: null } }),
    ).toBe(2);

    expect(
      (await request(app).post('/api/v1/auth/reset-password').send({ token: link1, newPassword }))
        .status,
    ).toBe(200);

    expect(
      await prisma.passwordResetToken.count({ where: { userId: user2.id, usedAt: null } }),
    ).toBe(0);

    const siblingAttempt = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: link2, newPassword: 'OtherPassword9!' });
    expect(siblingAttempt.status).toBe(400);
    expect(siblingAttempt.body.code).toBe('INVALID_RESET_TOKEN');
  });

  it('consumes at most one valid reset link under concurrent submissions on the same user (CWB-112 / F-03)', async () => {
    const user = await createUser();
    await passwordResetService.issueAndSend(user.email);
    const linkA = tokenFromLastEmail();
    await passwordResetService.issueAndSend(user.email);
    const linkB = tokenFromLastEmail();

    const passwordA = 'ConcurrentA1!';
    const passwordB = 'ConcurrentB2!';

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: linkA, newPassword: passwordA }),
      request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: linkB, newPassword: passwordB }),
    ]);

    const sorted = [resA, resB].sort((a, b) => a.status - b.status);
    expect(sorted.map((r) => r.status)).toEqual([200, 400]);
    expect(sorted[1].body.code).toBe('INVALID_RESET_TOKEN');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.tokenVersion).toBe(1);
    expect(
      await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null } }),
    ).toBe(0);

    const winningPassword = resA.status === 200 ? passwordA : passwordB;
    expect(await comparePassword(winningPassword, stored.passwordHash)).toBe(true);
  });

  it('deletes only already-expired tokens (expiresAt <= now) when issuing a new link (CWB-112)', async () => {
    const user = await createUser();
    const now = new Date();

    const expiredPastHash = '1'.repeat(64);
    const expiredBoundaryHash = '2'.repeat(64);
    const unexpiredHash = '3'.repeat(64);

    await prisma.passwordResetToken.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: expiredPastHash,
          expiresAt: new Date(now.getTime() - 60_000),
        },
        {
          userId: user.id,
          tokenHash: expiredBoundaryHash,
          expiresAt: now,
        },
        {
          userId: user.id,
          tokenHash: unexpiredHash,
          expiresAt: new Date(now.getTime() + 5 * 60_000),
        },
      ],
    });

    await passwordResetService.issueAndSend(user.email, now);
    const freshHash = hashResetToken(tokenFromLastEmail());

    const remaining = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
      select: { tokenHash: true },
    });
    expect(remaining.map((r) => r.tokenHash).sort()).toEqual([unexpiredHash, freshHash].sort());
  });

  it('refuses to issue or consume password reset tokens for locked or deleted accounts under row lock (CWB-112)', async () => {
    // 1. Locked account
    const lockedUser = await createUser();
    await passwordResetService.issueAndSend(lockedUser.email);
    const tokenBeforeLock = tokenFromLastEmail();

    await prisma.user.update({
      where: { id: lockedUser.id },
      data: { lockedAt: new Date(), lockReason: 'Khóa bảo mật' },
    });

    sentUrls = [];
    await passwordResetService.issueAndSend(lockedUser.email);
    expect(sentUrls).toHaveLength(0);
    expect(
      await passwordResetRepository.replaceToken(
        lockedUser.id,
        '4'.repeat(64),
        new Date(Date.now() + 60_000),
      ),
    ).toBe(false);

    const lockedReset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: tokenBeforeLock, newPassword });
    expect(lockedReset.status).toBe(400);
    expect(lockedReset.body.code).toBe('INVALID_RESET_TOKEN');
    const storedLocked = await prisma.user.findUniqueOrThrow({ where: { id: lockedUser.id } });
    expect(await comparePassword(password, storedLocked.passwordHash)).toBe(true);

    // 2. Deleted account
    const deletedUser = await createUser();
    const syntheticDeletedToken = 'b'.repeat(43);
    await prisma.passwordResetToken.create({
      data: {
        userId: deletedUser.id,
        tokenHash: hashResetToken(syntheticDeletedToken),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    await prisma.user.update({
      where: { id: deletedUser.id },
      data: { deletedAt: new Date() },
    });

    sentUrls = [];
    await passwordResetService.issueAndSend(deletedUser.email);
    expect(sentUrls).toHaveLength(0);
    expect(
      await passwordResetRepository.replaceToken(
        deletedUser.id,
        '5'.repeat(64),
        new Date(Date.now() + 60_000),
      ),
    ).toBe(false);

    const deletedReset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: syntheticDeletedToken, newPassword });
    expect(deletedReset.status).toBe(400);
    expect(deletedReset.body.code).toBe('INVALID_RESET_TOKEN');
    const storedDeleted = await prisma.user.findUniqueOrThrow({ where: { id: deletedUser.id } });
    expect(await comparePassword(password, storedDeleted.passwordHash)).toBe(true);
    expect(storedDeleted.tokenVersion).toBe(0);
  });

  it('keeps no usable token when delivery fails or SMTP is unavailable', async () => {
    const user = await createUser();
    vi.mocked(notificationService.sendPasswordReset).mockResolvedValueOnce(false);
    await passwordResetService.issueAndSend(user.email);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);

    vi.mocked(notificationService.canDeliver).mockReturnValue(false);
    await passwordResetService.issueAndSend(user.email);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it.each([
    [{ token: 'short', newPassword }],
    [{ token: 'a'.repeat(43), newPassword: 'short' }],
    [{ token: 'a'.repeat(43), newPassword, email: 'x@example.com' }],
  ])('validates reset input %#', async (body) => {
    const res = await request(app).post('/api/v1/auth/reset-password').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rate limits forgot-password requests per client (429 after 5)', async () => {
    const send = () =>
      request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: `${prefix}_nobody@example.com` });
    for (let i = 0; i < 5; i++) expect((await send()).status).toBe(200);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    await drainBackgroundTasks(5000);
  });
});
