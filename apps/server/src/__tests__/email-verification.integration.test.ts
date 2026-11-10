import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma, Role } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { TestAccounts } from './support/test-accounts.js';
import {
  emailVerificationRepository,
  hashVerificationToken,
} from '../repositories/email-verification.repository.js';
import { EmailOutboxService, emailOutboxService } from '../services/email-outbox.service.js';
import { NotificationService } from '../services/notification.service.js';
import { hashPassword } from '../utils/password.util.js';
import { AuthService } from '../services/auth.service.js';
import { userRepository } from '../repositories/user.repository.js';

describe('Email verification integration tests (CWB-87, real MySQL)', () => {
  const accounts = new TestAccounts();
  const createdUserIds: string[] = [];
  const createdRoomIds: string[] = [];
  let testRoomId: string;

  beforeAll(async () => {
    await accounts.persist();

    // Create a bookable room for testing bookings
    const room = await prisma.room.create({
      data: {
        name: `Room-Verify-${randomUUID().slice(0, 8)}`,
        capacity: 4,
        pricePerHour: 100000,
        status: 'AVAILABLE',
      },
    });
    testRoomId = room.id;
    createdRoomIds.push(room.id);
  });

  afterAll(async () => {
    await accounts.cleanup();
    if (createdUserIds.length > 0) {
      await prisma.emailVerificationToken.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.emailOutbox.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.booking.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    if (createdRoomIds.length > 0) {
      await prisma.booking.deleteMany({
        where: { roomId: { in: createdRoomIds } },
      });
      await prisma.room.deleteMany({
        where: { id: { in: createdRoomIds } },
      });
    }
  });

  it('register creates user with emailVerifiedAt: null and atomically enqueues EMAIL_VERIFICATION outbox', async () => {
    const email = `unverified-${randomUUID()}@example.com`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Password123!',
        fullName: 'New Customer',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.emailVerifiedAt).toBeNull();

    const userId = res.body.data.id;
    createdUserIds.push(userId);

    // Verify database record has emailVerifiedAt null
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(dbUser.emailVerifiedAt).toBeNull();

    // Verify outbox row exists for this user with kind EMAIL_VERIFICATION
    const outboxRow = await prisma.emailOutbox.findFirst({
      where: { userId, kind: 'EMAIL_VERIFICATION' },
    });
    expect(outboxRow).not.toBeNull();
    expect(outboxRow?.status).toBe('QUEUED');
    expect(outboxRow?.bookingId).toBeNull();
  });

  it('unverified customer can login and view rooms, but booking is blocked with 403 EMAIL_NOT_VERIFIED', async () => {
    const email = `unverified-booking-${randomUUID()}@example.com`;
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Password123!',
        fullName: 'Blocked Customer',
      });
    expect(regRes.status).toBe(201);
    const userId = regRes.body.data.id;
    createdUserIds.push(userId);

    // Login succeeds
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123!' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.accessToken;

    // View rooms succeeds
    const roomsRes = await request(app).get('/api/v1/rooms');
    expect(roomsRes.status).toBe(200);

    // /me profile shows emailVerifiedAt: null
    const meRes = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.emailVerifiedAt).toBeNull();

    // Create booking fails with 403 EMAIL_NOT_VERIFIED
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    tomorrow.setUTCHours(2, 0, 0, 0); // 09:00 Vietnam time
    const startTime = tomorrow.toISOString();
    const endTime = new Date(tomorrow.getTime() + 2 * 3600 * 1000).toISOString();

    const bookRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        roomId: testRoomId,
        startTime,
        endTime,
      });

    expect(bookRes.status).toBe(403);
    expect(bookRes.body.code).toBe('EMAIL_NOT_VERIFIED');

    // Confirm no booking was inserted
    const bookingCount = await prisma.booking.count({ where: { userId } });
    expect(bookingCount).toBe(0);
  });

  it('worker processes EMAIL_VERIFICATION: issues hashed token, delivers email link, updates outbox to SENT', async () => {
    const email = `worker-verify-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Worker Verify User',
        passwordHash: await hashPassword('Password123!'),
        role: Role.CUSTOMER,
        emailVerifiedAt: null,
      },
    });
    createdUserIds.push(user.id);

    // Enqueue outbox row
    await prisma.emailOutbox.create({
      data: {
        kind: 'EMAIL_VERIFICATION',
        userId: user.id,
        status: 'QUEUED',
      },
    });

    const sentTokens = new Map<string, string>();
    const mockNotification = {
      canDeliver: () => true,
      sendEmailVerification: async (payload: any) => {
        sentTokens.set(payload.reference, payload.verifyUrl);
        return true;
      },
      sendPasswordReset: async () => true,
      sendBookingConfirmation: async () => true,
      sendBookingReminder: async () => true,
      sendBookingCancellation: async () => true,
      sendBookingRescheduled: async () => true,
    } as unknown as NotificationService;

    const worker = new EmailOutboxService(mockNotification, prisma);
    const result = await worker.processDue();

    expect(result.sent).toBeGreaterThanOrEqual(1);

    // Outbox row marked SENT
    const outboxRow = await prisma.emailOutbox.findFirstOrThrow({
      where: { userId: user.id, kind: 'EMAIL_VERIFICATION' },
    });
    expect(outboxRow.status).toBe('SENT');
    expect(outboxRow.sentAt).not.toBeNull();

    // Verify token URL was generated with token for this specific user
    const sentVerifyUrl = sentTokens.get(user.id);
    expect(sentVerifyUrl).toBeDefined();
    expect(sentVerifyUrl).toContain('/verify-email?token=');
    const token = sentVerifyUrl!.split('token=')[1];
    expect(token).toBeDefined();

    // Verify only the hash is stored in DB
    const tokenRecord = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(tokenRecord.tokenHash).toBe(hashVerificationToken(token));
    expect(tokenRecord.usedAt).toBeNull();
  });

  it('verify-email endpoint validates token, marks user verified, rejects replay, and unlocks booking', async () => {
    const email = `claim-verify-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Claim User',
        passwordHash: await hashPassword('Password123!'),
        role: Role.CUSTOMER,
        emailVerifiedAt: null,
      },
    });
    createdUserIds.push(user.id);

    // Login before verification
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123!' });
    const jwtToken = loginRes.body.data.accessToken;

    // Issue token
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashVerificationToken(rawToken);
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    // 1. Verify with invalid tokens (missing, malformed, unknown format) -> all return 400 INVALID_VERIFICATION_TOKEN
    const emptyRes = await request(app).post('/api/v1/auth/verify-email').send({});
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.code).toBe('INVALID_VERIFICATION_TOKEN');

    const shortRes = await request(app).post('/api/v1/auth/verify-email').send({ token: 'short' });
    expect(shortRes.status).toBe(400);
    expect(shortRes.body.code).toBe('INVALID_VERIFICATION_TOKEN');

    const badRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'invalid-token-12345' });
    expect(badRes.status).toBe(400);
    expect(badRes.body.code).toBe('INVALID_VERIFICATION_TOKEN');

    const unknownToken = randomBytes(32).toString('base64url');
    const unknownRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: unknownToken });
    expect(unknownRes.status).toBe(400);
    expect(unknownRes.body.code).toBe('INVALID_VERIFICATION_TOKEN');

    // 2. Verify with valid token
    const goodRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: rawToken });
    expect(goodRes.status).toBe(200);
    expect(goodRes.body.success).toBe(true);

    // 3. User is now verified in DB
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.emailVerifiedAt).not.toBeNull();

    // 4. Replay fails with 400 INVALID_VERIFICATION_TOKEN
    const replayRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: rawToken });
    expect(replayRes.status).toBe(400);
    expect(replayRes.body.code).toBe('INVALID_VERIFICATION_TOKEN');

    // 5. Customer can now book using the exact same JWT!
    const tomorrow = new Date(Date.now() + 48 * 3600 * 1000);
    tomorrow.setUTCHours(2, 0, 0, 0); // 09:00 Vietnam time
    const startTime = tomorrow.toISOString();
    const endTime = new Date(tomorrow.getTime() + 2 * 3600 * 1000).toISOString();

    const bookRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        roomId: testRoomId,
        startTime,
        endTime,
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.success).toBe(true);
    expect(bookRes.body.data.status).toBe('CONFIRMED');
  });

  it('resend-verification enforces authentication and rate limits', async () => {
    // 401 without auth
    const unauthRes = await request(app).post('/api/v1/auth/resend-verification').send({});
    expect(unauthRes.status).toBe(401);

    // With authenticated customer
    const email = `resend-test-${randomUUID()}@example.com`;
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Password123!',
        fullName: 'Resend User',
      });
    const userId = regRes.body.data.id;
    createdUserIds.push(userId);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123!' });
    const token = loginRes.body.data.accessToken;

    // Resend succeeds
    const res1 = await request(app)
      .post('/api/v1/auth/resend-verification')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);

    // Call remaining 4 times (total 5)
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(200);
    }

    // 6th call hits rate limit 429
    const limitedRes = await request(app)
      .post('/api/v1/auth/resend-verification')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(limitedRes.status).toBe(429);
    expect(limitedRes.body.code).toBe('TOO_MANY_REQUESTS');
  });

  it('concurrent verification of the same token produces exactly one success and one rejection', async () => {
    const email = `concurrent-verify-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Concurrent Token User',
        passwordHash: await hashPassword('Password123!'),
        role: Role.CUSTOMER,
        emailVerifiedAt: null,
      },
    });
    createdUserIds.push(user.id);

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashVerificationToken(rawToken);
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const [res1, res2] = await Promise.all([
      request(app).post('/api/v1/auth/verify-email').send({ token: rawToken }),
      request(app).post('/api/v1/auth/verify-email').send({ token: rawToken }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 400]);
  });

  it('verify-email rejects expired tokens and enforces strict boundary condition (S1, P1, T1)', async () => {
    const email = `expiry-test-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Expiry User',
        passwordHash: await hashPassword('Password123!'),
        role: Role.CUSTOMER,
        emailVerifiedAt: null,
      },
    });
    createdUserIds.push(user.id);

    // 1. Expired token (expiresAt 10 seconds in the past)
    const expiredRawToken = randomBytes(32).toString('base64url');
    const expiredTokenHash = hashVerificationToken(expiredRawToken);
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: expiredTokenHash,
        expiresAt: new Date(Date.now() - 10 * 1000),
      },
    });

    const expiredRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: expiredRawToken });

    expect(expiredRes.status).toBe(400);
    expect(expiredRes.body.code).toBe('INVALID_VERIFICATION_TOKEN');

    // Confirm account remains unverified and token was not consumed
    const dbUserAfterExpired = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUserAfterExpired.emailVerifiedAt).toBeNull();

    const dbTokenAfterExpired = await prisma.emailVerificationToken.findUniqueOrThrow({
      where: { tokenHash: expiredTokenHash },
    });
    expect(dbTokenAfterExpired.usedAt).toBeNull();

    // 2. Strict boundary condition: now === expiresAt must reject; now < expiresAt must succeed
    const boundaryRawToken = randomBytes(32).toString('base64url');
    const boundaryTokenHash = hashVerificationToken(boundaryRawToken);
    const boundaryTime = new Date('2026-11-10T12:00:00.000Z');

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: boundaryTokenHash,
        expiresAt: boundaryTime,
      },
    });

    // Exact boundary: evaluation time is exactly expiresAt => token.expiresAt <= now => must return null
    const exactBoundaryResult = await emailVerificationRepository.consumeToken(
      boundaryTokenHash,
      boundaryTime,
    );
    expect(exactBoundaryResult).toBeNull();

    const userStillUnverified = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userStillUnverified.emailVerifiedAt).toBeNull();

    // Just 1 second before expiry => token.expiresAt > now => claim succeeds!
    const validBoundaryResult = await emailVerificationRepository.consumeToken(
      boundaryTokenHash,
      new Date(boundaryTime.getTime() - 1000),
    );
    expect(validBoundaryResult).toEqual({ userId: user.id });

    const userNowVerified = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userNowVerified.emailVerifiedAt).not.toBeNull();
  });

  it('worker delivery failure and retry preserves earlier issued link for verification (S1, T2)', async () => {
    const email = `retry-preserve-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Retry Preserve User',
        passwordHash: await hashPassword('Password123!'),
        role: Role.CUSTOMER,
        emailVerifiedAt: null,
      },
    });
    createdUserIds.push(user.id);

    const outbox = await prisma.emailOutbox.create({
      data: {
        kind: 'EMAIL_VERIFICATION',
        userId: user.id,
        status: 'QUEUED',
      },
    });

    const sentUrls: string[] = [];
    let shouldSucceed = false;

    const mockNotification = {
      canDeliver: () => true,
      sendEmailVerification: async (payload: any) => {
        if (payload.reference === user.id) {
          sentUrls.push(payload.verifyUrl);
          return shouldSucceed;
        }
        return true;
      },
      sendPasswordReset: async () => true,
      sendBookingConfirmation: async () => true,
      sendBookingReminder: async () => true,
      sendBookingCancellation: async () => true,
      sendBookingRescheduled: async () => true,
    } as unknown as NotificationService;

    const worker = new EmailOutboxService(mockNotification, prisma);

    // Pass 1: Delivery fails (e.g. SMTP connection timeout / failure)
    shouldSucceed = false;
    const pass1Result = await worker.processDue();
    expect(pass1Result.retried).toBeGreaterThanOrEqual(1);

    const outboxAfterPass1 = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: outbox.id } });
    expect(outboxAfterPass1.status).toBe('QUEUED');
    expect(outboxAfterPass1.attempts).toBe(1);
    expect(outboxAfterPass1.lastError).toBe('SMTP_ERROR');

    // First link was generated and emailed
    expect(sentUrls).toHaveLength(1);
    const firstToken = sentUrls[0].split('token=')[1];
    expect(firstToken).toBeDefined();

    // User is still unverified
    const userAfterPass1 = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userAfterPass1.emailVerifiedAt).toBeNull();

    // Pass 2: Retry after delay succeeds
    shouldSucceed = true;
    const pass2Result = await worker.processDue(new Date(Date.now() + 60 * 1000));
    expect(pass2Result.sent).toBeGreaterThanOrEqual(1);

    const outboxAfterPass2 = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: outbox.id } });
    expect(outboxAfterPass2.status).toBe('SENT');
    expect(outboxAfterPass2.sentAt).not.toBeNull();

    // Second link was generated
    expect(sentUrls).toHaveLength(2);
    const secondToken = sentUrls[1].split('token=')[1];
    expect(secondToken).toBeDefined();
    expect(secondToken).not.toBe(firstToken);

    // Both tokens are stored in DB and unexpired
    const activeTokens = await prisma.emailVerificationToken.findMany({
      where: { userId: user.id },
    });
    expect(activeTokens).toHaveLength(2);

    // User clicks the FIRST link (from ambiguous SMTP delivery) => must succeed!
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: firstToken });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);

    // Account is now verified
    const verifiedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verifiedUser.emailVerifiedAt).not.toBeNull();

    // First token is marked used, second token was invalidated/cleaned up
    const remainingTokens = await prisma.emailVerificationToken.findMany({
      where: { userId: user.id },
    });
    expect(remainingTokens).toHaveLength(1);
    expect(remainingTokens[0].tokenHash).toBe(hashVerificationToken(firstToken));
    expect(remainingTokens[0].usedAt).not.toBeNull();
  });

  it('registration transaction rolls back user creation when outbox enqueue fails (S1, T2)', async () => {
    const email = `rollback-integration-${randomUUID()}@example.com`;
    const failingOutboxRepo = {
      enqueueAccountEmail: vi.fn().mockRejectedValue(new Error('Outbox enqueue failed')),
    };
    const testAuthService = new AuthService(
      userRepository,
      emailOutboxService,
      failingOutboxRepo as any,
      prisma,
    );

    await expect(
      testAuthService.register({
        email,
        password: 'Password123!',
        fullName: 'Rollback User',
      }),
    ).rejects.toThrow('Outbox enqueue failed');

    // Confirm NO user record exists in MySQL database
    const dbUser = await prisma.user.findUnique({ where: { email } });
    expect(dbUser).toBeNull();
  });

  it('legacy verified user can create booking without hindrance (P2 backfill proof)', async () => {
    const email = `legacy-user-${randomUUID()}@example.com`;
    // 1. User existed before migration backfill (emailVerifiedAt: null)
    const legacyUser = await prisma.user.create({
      data: {
        email,
        fullName: 'Legacy Customer',
        passwordHash: await hashPassword('Password123!'),
        role: Role.CUSTOMER,
        emailVerifiedAt: null,
      },
    });
    createdUserIds.push(legacyUser.id);

    // 2. Execute migration backfill query on this legacy record
    await prisma.$executeRaw(
      Prisma.sql`UPDATE users SET email_verified_at = CURRENT_TIMESTAMP(3) WHERE id = ${legacyUser.id}`,
    );

    const refreshedUser = await prisma.user.findUniqueOrThrow({ where: { id: legacyUser.id } });
    expect(refreshedUser.emailVerifiedAt).not.toBeNull();

    // 3. Legacy user logs in and books without hindrance
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123!' });
    const token = loginRes.body.data.accessToken;

    const tomorrow = new Date(Date.now() + 72 * 3600 * 1000);
    tomorrow.setUTCHours(4, 0, 0, 0); // 11:00 Vietnam time
    const startTime = tomorrow.toISOString();
    const endTime = new Date(tomorrow.getTime() + 2 * 3600 * 1000).toISOString();

    const bookRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        roomId: testRoomId,
        startTime,
        endTime,
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.success).toBe(true);
  });
});
