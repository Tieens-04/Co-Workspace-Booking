import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Prisma, Role, User } from '@prisma/client';
import app from '../app.js';
import { userRepository } from '../repositories/user.repository.js';
import { hashPassword, comparePassword } from '../utils/password.util.js';
import { generateToken, verifyToken } from '../utils/jwt.util.js';
import { ENV } from '../config/env.config.js';
import { errorHandler } from '../middlewares/error.middleware.js';

// Any accidental persistence access fails: these tests cannot connect to a real DB.
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const registration = {
  email: 'customer@example.com',
  password: 'Password123!',
  fullName: 'Customer',
};
const fixture = (passwordHash: string, role: Role = Role.CUSTOMER): User => ({
  id: 'user-id',
  email: registration.email,
  fullName: registration.fullName,
  phoneNumber: null,
  role,
  passwordHash,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const uniqueError = (target: unknown) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target },
  });

beforeEach(() => {
  vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
  vi.spyOn(userRepository, 'create').mockImplementation(async (data) => ({
    ...fixture(data.passwordHash),
    ...data,
    phoneNumber: data.phoneNumber ?? null,
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  ENV.JWT_EXPIRES_IN_SECONDS = 3600;
});

describe('Register/Login HTTP regressions (mocked repository, real bcrypt/JWT)', () => {
  it('registers a CUSTOMER, hashes the password and returns only safe fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...registration, email: ' CUSTOMER@EXAMPLE.COM ' });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: 'user-id',
      email: registration.email,
      fullName: 'Customer',
      phoneNumber: null,
      role: 'CUSTOMER',
    });
    const saved = vi.mocked(userRepository.create).mock.calls[0][0];
    expect(saved.passwordHash).not.toBe(registration.password);
    expect(await comparePassword(registration.password, saved.passwordHash)).toBe(true);
    expect(saved.role).toBe('CUSTOMER');
  });

  it.each([Role.CUSTOMER, Role.ADMIN])(
    'logs in %s with valid claims and configured lifetime',
    async (role) => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(
        fixture(await hashPassword(registration.password), role),
      );
      ENV.JWT_EXPIRES_IN_SECONDS = 900;
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: ' CUSTOMER@EXAMPLE.COM ', password: registration.password });
      expect(res.status).toBe(200);
      expect(res.body.data.expiresIn).toBe(900);
      expect(res.body.data.tokenType).toBe('Bearer');
      const claims = verifyToken(res.body.data.accessToken);
      expect(claims.sub).toBe('user-id');
      expect(claims.role).toBe(role);
      expect(claims.exp! - claims.iat!).toBe(res.body.data.expiresIn);
      expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
      expect(res.body.data.user.passwordHash).toBeUndefined();
    },
  );

  it('gives the same 401 without a token for unknown email and wrong password', async () => {
    const missing = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: 'WrongPassword!' });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(
      fixture(await hashPassword(registration.password)),
    );
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: 'WrongPassword!' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.data).toBeUndefined();
  });

  it.each(['a'.repeat(72), 'é'.repeat(36)])(
    'accepts exactly 72 bytes but rejects an appended suffix at login',
    async (password) => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(
        fixture(await hashPassword(password)),
      );
      const good = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: registration.email, password });
      expect(good.status).toBe(200);
      vi.mocked(userRepository.findByEmail).mockClear();
      const bad = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: registration.email, password: password + 'x' });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    },
  );

  it.each(['12345678', 'a'.repeat(72), 'é'.repeat(36)])(
    'accepts register password boundaries',
    async (password) => {
      expect(
        (
          await request(app)
            .post('/api/v1/auth/register')
            .send({ ...registration, password })
        ).status,
      ).toBe(201);
    },
  );

  it.each([
    { password: '1234567' },
    { password: 'é'.repeat(37) },
    { password: 'a'.repeat(73) },
    { role: 'ADMIN' },
    { password: undefined },
    { email: 'invalid' },
    { fullName: ' ' },
    { fullName: 'x'.repeat(192) },
    { phoneNumber: '1'.repeat(192) },
    { email: 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.com' },
  ])('rejects invalid register data before persistence: %j', async (invalid) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...registration, ...invalid });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('accepts text fields at the schema limit', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...registration, fullName: 'x'.repeat(191), phoneNumber: '1'.repeat(191) });
    expect(res.status).toBe(201);
  });

  it('returns 409 for an existing email', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(fixture('unused'));
    const res = await request(app).post('/api/v1/auth/register').send(registration);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it.each([['email'], 'users_email_key'])('maps email unique races to 409: %j', async (target) => {
    vi.mocked(userRepository.create).mockRejectedValue(uniqueError(target));
    const res = await request(app).post('/api/v1/auth/register').send(registration);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('does not label another User unique constraint as an email conflict', async () => {
    vi.mocked(userRepository.create).mockRejectedValue(uniqueError(['id']));
    const res = await request(app).post('/api/v1/auth/register').send(registration);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RESOURCE_CONFLICT');
  });

  it('returns a generic 409 for a booking unique constraint', async () => {
    const testApp = express();
    testApp.get('/', (_req, _res, next) => next(uniqueError(['bookingCode'])));
    testApp.use(errorHandler);
    const res = await request(testApp).get('/');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RESOURCE_CONFLICT');
    expect(JSON.stringify(res.body)).not.toContain('bookingCode');
  });

  it('rejects expired and tampered JWTs', () => {
    const expired = generateToken({ sub: 'id', role: Role.CUSTOMER }, { expiresIn: -10 });
    expect(() => verifyToken(expired)).toThrow();
    const token = generateToken({ sub: 'id', role: Role.CUSTOMER });
    const parts = token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: 'id', role: 'ADMIN' })).toString('base64url');
    expect(() => verifyToken(parts.join('.'))).toThrow();
  });
});
