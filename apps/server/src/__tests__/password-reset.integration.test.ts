import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { comparePassword, hashPassword } from '../utils/password.util.js';
import { drainBackgroundTasks } from '../utils/background-tasks.util.js';
import { notificationService } from '../services/notification.service.js';
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
  let sentUrls: string[];

  const createUser = async () => {
    const email = `${prefix}_${randomUUID()}@example.com`;
    emails.push(email);
    return prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), fullName: 'Người dùng reset' },
    });
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
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
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

  it('invalidates the previous link when a new one is requested', async () => {
    const user = await createUser();
    await passwordResetService.issueAndSend(user.email);
    const first = tokenFromLastEmail();
    await passwordResetService.issueAndSend(user.email);
    const second = tokenFromLastEmail();

    expect(
      (await request(app).post('/api/v1/auth/reset-password').send({ token: first, newPassword }))
        .status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/v1/auth/reset-password').send({ token: second, newPassword }))
        .status,
    ).toBe(200);
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
