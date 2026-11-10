import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { comparePassword, hashPassword } from '../utils/password.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { ENV } from '../config/env.config.js';
import { changePasswordRateLimiter } from '../middlewares/rate-limit.middleware.js';

describe('Account self-service /api/v1/me (CWB-63, real MySQL)', () => {
  const prefix = `test_me_${randomUUID()}`;
  const password = 'Password123!';
  const createdEmails: string[] = [];

  const createUser = async (role: Role = Role.CUSTOMER, label = randomUUID()) => {
    const email = `${prefix}_${label}@example.com`;
    createdEmails.push(email);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        fullName: `Người dùng ${label}`,
        phoneNumber: '0900000000',
        role,
      },
    });
    return { user, token: generateToken({ sub: user.id, role: user.role }) };
  };

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  });

  it('requires authentication for every /me endpoint', async () => {
    for (const call of [
      request(app).get('/api/v1/me'),
      request(app).patch('/api/v1/me').send({ fullName: 'X' }),
      request(app).post('/api/v1/me/password').send({ currentPassword: 'a', newPassword: 'b' }),
      request(app).post('/api/v1/me/logout-all'),
    ]) {
      const res = await call;
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    }
  });

  it.each([Role.CUSTOMER, Role.ADMIN])(
    'returns the %s profile from the token identity only',
    async (role) => {
      const { user, token } = await createUser(role);
      await createUser(); // another account must never leak through

      const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: '0900000000',
        role,
        emailVerifiedAt: null,
      });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    },
  );

  it('returns 401 when the token belongs to a deleted account', async () => {
    const { user, token } = await createUser();
    await prisma.user.delete({ where: { id: user.id } });

    const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('updates only fullName and phoneNumber, trimming and clearing the phone', async () => {
    const { user, token } = await createUser();

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: '  Trần Văn Mới  ', phoneNumber: '' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ fullName: 'Trần Văn Mới', phoneNumber: null });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored).toMatchObject({
      fullName: 'Trần Văn Mới',
      phoneNumber: null,
      role: Role.CUSTOMER,
    });
  });

  it.each([
    [{ role: Role.ADMIN }],
    [{ fullName: 'Ok', role: Role.ADMIN }],
    [{ email: 'evil@example.com' }],
    [{ id: randomUUID() }],
    [{ passwordHash: 'x' }],
    [{}],
    [{ fullName: '   ' }],
    [{ phoneNumber: 'abc' }],
  ])('rejects mass assignment or empty updates %j with 400', async (body) => {
    const { user, token } = await createUser();

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.role).toBe(Role.CUSTOMER);
    expect(stored.email).toBe(user.email);
  });

  it('normalizes phoneNumber and saves valid Vietnamese format (CWB-74)', async () => {
    const { user, token } = await createUser();

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: '+84 912.345-678' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ phoneNumber: '+84912345678' });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.phoneNumber).toBe('+84912345678');
  });

  it('changes the password, returns a fresh token and lets the user log in with it', async () => {
    const { user, token } = await createUser();
    const newPassword = 'NewPassword456!';

    const res = await request(app)
      .post('/api/v1/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokenType: 'Bearer', user: { id: user.id } });
    expect(typeof res.body.data.accessToken).toBe('string');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await comparePassword(newPassword, stored.passwordHash)).toBe(true);

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: newPassword });
    expect(newLogin.status).toBe(200);

    const withFreshToken = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(withFreshToken.status).toBe(200);
  });

  it('rejects a wrong current password with 400 and keeps the stored hash', async () => {
    const { user, token } = await createUser();
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;

    const res = await request(app)
      .post('/api/v1/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPassword!', newPassword: 'NewPassword456!' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CURRENT_PASSWORD');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(
      before,
    );
  });

  it.each([
    [{ currentPassword: password, newPassword: 'short' }],
    [{ currentPassword: password, newPassword: password }],
    [{ currentPassword: password, newPassword: 'x'.repeat(73) }],
    [{ currentPassword: password, newPassword: 'NewPassword456!', role: 'ADMIN' }],
  ])('validates the new password %#', async (body) => {
    const { token } = await createUser();
    const res = await request(app)
      .post('/api/v1/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rate limits repeated wrong current passwords per account (429 after 5 failures)', async () => {
    const { user, token } = await createUser();
    const attempt = () =>
      request(app)
        .post('/api/v1/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'WrongPassword!', newPassword: 'NewPassword456!' });

    try {
      for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(400);
      const blocked = await attempt();
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');

      // Another account is not affected by this account's failures.
      const other = await createUser();
      const res = await request(app)
        .post('/api/v1/me/password')
        .set('Authorization', `Bearer ${other.token}`)
        .send({ currentPassword: 'WrongPassword!', newPassword: 'NewPassword456!' });
      expect(res.status).toBe(400);
    } finally {
      await changePasswordRateLimiter.resetKey(`user:${user.id}`);
    }
  });
  describe('server-side token revocation (CWB-77)', () => {
    const me = (token: string) =>
      request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    const storedVersion = async (id: string) =>
      (await prisma.user.findUniqueOrThrow({ where: { id } })).tokenVersion;

    it('starts accounts at token version 0 and accepts tokens issued before the tv claim', async () => {
      const { user } = await createUser();
      expect(await storedVersion(user.id)).toBe(0);
      const legacy = jwt.sign({ sub: user.id, role: user.role }, ENV.JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: '1h',
      });
      expect((await me(legacy)).status).toBe(200);
    });

    it('password change keeps this session on the new token and revokes every other one', async () => {
      const { user, token: thisDevice } = await createUser();
      const otherDevice = generateToken({ sub: user.id, role: user.role, tv: 0 });

      const res = await request(app)
        .post('/api/v1/me/password')
        .set('Authorization', `Bearer ${thisDevice}`)
        .send({ currentPassword: password, newPassword: 'NewPassword456!' });

      expect(res.status).toBe(200);
      expect(await storedVersion(user.id)).toBe(1);
      expect((await me(res.body.data.accessToken)).status).toBe(200);
      for (const revoked of [thisDevice, otherDevice]) {
        const denied = await me(revoked);
        expect(denied.status).toBe(401);
        expect(denied.body).toEqual({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Token không hợp lệ hoặc đã hết hạn',
        });
      }

      // A fresh login carries the new version and works.
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'NewPassword456!' });
      expect(login.status).toBe(200);
      expect((await me(login.body.data.accessToken)).status).toBe(200);
    });

    it('a wrong current password revokes nothing', async () => {
      const { user, token } = await createUser();
      const res = await request(app)
        .post('/api/v1/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'WrongPassword!', newPassword: 'NewPassword456!' });
      expect(res.status).toBe(400);
      expect(await storedVersion(user.id)).toBe(0);
      expect((await me(token)).status).toBe(200);
      await changePasswordRateLimiter.resetKey(`user:${user.id}`);
    });

    it('POST /me/logout-all revokes every token of the account, this one included', async () => {
      const { user, token } = await createUser(Role.ADMIN);
      const otherDevice = generateToken({ sub: user.id, role: user.role, tv: 0 });
      const { token: otherAccount } = await createUser();

      const res = await request(app)
        .post('/api/v1/me/logout-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, data: null });
      expect(await storedVersion(user.id)).toBe(1);
      expect((await me(token)).status).toBe(401);
      expect((await me(otherDevice)).status).toBe(401);
      // Admin capabilities are revoked too (401, not 403), and other accounts are unaffected.
      expect(
        (await request(app).get('/api/v1/admin/rooms').set('Authorization', `Bearer ${token}`))
          .status,
      ).toBe(401);
      expect((await me(otherAccount)).status).toBe(200);
      // A revoked token cannot be used to call logout-all again.
      expect(
        (await request(app).post('/api/v1/me/logout-all').set('Authorization', `Bearer ${token}`))
          .status,
      ).toBe(401);

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password });
      expect(login.status).toBe(200);
      expect((await me(login.body.data.accessToken)).status).toBe(200);
    });

    it('rejects input on logout-all without revoking', async () => {
      const { user, token } = await createUser();
      const withBody = await request(app)
        .post('/api/v1/me/logout-all')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: randomUUID() });
      const withQuery = await request(app)
        .post('/api/v1/me/logout-all?userId=x')
        .set('Authorization', `Bearer ${token}`);
      expect(withBody.status).toBe(400);
      expect(withQuery.status).toBe(400);
      expect(await storedVersion(user.id)).toBe(0);
    });
  });
});
