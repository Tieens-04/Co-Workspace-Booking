import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { comparePassword, hashPassword } from '../utils/password.util.js';
import { generateToken, verifyToken, JwtCustomPayload } from '../utils/jwt.util.js';
import { Role } from '@prisma/client';
import { AuthService } from '../services/auth.service.js';
import { UserRepository } from '../repositories/user.repository.js';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

describe('Auth Integration & Unit Tests', () => {
  const testPrefix = `test_${randomUUID()}`;
  const customerEmail = `${testPrefix}_customer@example.com`;
  const adminEmail = `${testPrefix}_admin@example.com`;
  const customerPassword = 'Password123!';
  const adminPassword = 'AdminPassword123!';

  beforeAll(async () => {
    // Seed an admin user for login test
    const adminPasswordHash = await hashPassword(adminPassword);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        fullName: 'Test Admin',
        role: Role.ADMIN,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            customerEmail,
            adminEmail,
            ...['uppercase', 'boundary8', 'boundary72'].map(
              (suffix) => `${testPrefix}_${suffix}@example.com`,
            ),
          ],
        },
      },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new customer successfully (201)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: customerEmail,
        password: customerPassword,
        fullName: 'Test Customer',
        phoneNumber: '0912345678',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      const user = res.body.data;
      expect(user.id).toBeDefined();
      expect(user.email).toBe(customerEmail);
      expect(user.fullName).toBe('Test Customer');
      expect(user.phoneNumber).toBe('0912345678');
      expect(user.role).toBe('CUSTOMER');

      // Invariant: Do NOT leak passwordHash or token in response
      expect(user.passwordHash).toBeUndefined();
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.token).toBeUndefined();

      // Verify user in database
      const dbUser = await prisma.user.findUnique({
        where: { email: customerEmail },
      });
      expect(dbUser).toBeDefined();
      expect(dbUser!.role).toBe(Role.CUSTOMER);
      expect(dbUser!.passwordHash).not.toBe(customerPassword);
      const isMatch = await comparePassword(customerPassword, dbUser!.passwordHash);
      expect(isMatch).toBe(true);
    });

    it('should reject registration if email already exists with 409 EMAIL_ALREADY_EXISTS', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: customerEmail,
        password: customerPassword,
        fullName: 'Duplicate Customer',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(res.body.message).toBeDefined();
    });

    it('should normalize email by trimming and lowercasing', async () => {
      const unnormalizedEmail = `   ${testPrefix}_UPPERCASE@EXAMPLE.COM   `;
      const normalizedEmail = `${testPrefix}_uppercase@example.com`;

      const res = await request(app).post('/api/v1/auth/register').send({
        email: unnormalizedEmail,
        password: 'ValidPassword123',
        fullName: 'Case Test',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe(normalizedEmail);

      const dbUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      expect(dbUser).toBeDefined();
    });

    it('should reject registration with forbidden fields like role (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `${testPrefix}_hacker@example.com`,
          password: 'Password123!',
          fullName: 'Hacker',
          role: 'ADMIN',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid or missing fields (400 VALIDATION_ERROR)', async () => {
      // Missing password
      const res1 = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `${testPrefix}_nopass@example.com`,
          fullName: 'No Pass',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.code).toBe('VALIDATION_ERROR');

      // Invalid email
      const res2 = await request(app).post('/api/v1/auth/register').send({
        email: 'not-an-email',
        password: 'Password123!',
        fullName: 'Bad Email',
      });
      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe('VALIDATION_ERROR');

      // Password < 8 characters
      const res3 = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `${testPrefix}_short@example.com`,
          password: 'short',
          fullName: 'Short Pass',
        });
      expect(res3.status).toBe(400);
      expect(res3.body.code).toBe('VALIDATION_ERROR');

      // Password > 72 UTF-8 bytes
      const longPassword = 'a'.repeat(73);
      const res4 = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `${testPrefix}_long@example.com`,
          password: longPassword,
          fullName: 'Long Pass',
        });
      expect(res4.status).toBe(400);
      expect(res4.body.code).toBe('VALIDATION_ERROR');
    });

    it('should accept passwords at boundary lengths (8 chars and 72 bytes)', async () => {
      // Boundary 8 chars
      const res1 = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `${testPrefix}_boundary8@example.com`,
          password: '12345678',
          fullName: 'Boundary 8',
        });
      expect(res1.status).toBe(201);

      // Boundary 72 bytes
      const password72 = 'x'.repeat(72);
      const res2 = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `${testPrefix}_boundary72@example.com`,
          password: password72,
          fullName: 'Boundary 72',
        });
      expect(res2.status).toBe(201);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login CUSTOMER successfully with valid JWT token (200)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: customerEmail,
        password: customerPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.accessToken).toBeDefined();
      expect(data.tokenType).toBe('Bearer');
      expect(data.expiresIn).toBe(3600);

      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(customerEmail);
      expect(data.user.role).toBe('CUSTOMER');
      expect(data.user.passwordHash).toBeUndefined();

      // Verify JWT payload
      const decoded = verifyToken<JwtCustomPayload>(data.accessToken);
      expect(decoded.sub).toBe(data.user.id);
      expect(decoded.role).toBe('CUSTOMER');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      // Expiry approx 1 hour (3600 seconds)
      expect(decoded.exp! - decoded.iat!).toBe(3600);
    });

    it('should login ADMIN successfully with valid JWT token and role ADMIN (200)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: adminEmail,
        password: adminPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.user.role).toBe('ADMIN');

      const decoded = verifyToken<JwtCustomPayload>(data.accessToken);
      expect(decoded.role).toBe('ADMIN');
    });

    it('should allow login with case-insensitive / trimmed email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: `  ${customerEmail.toUpperCase()}  `,
          password: customerPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(customerEmail);
    });

    it('should return 401 INVALID_CREDENTIALS for wrong password', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: customerEmail,
        password: 'IncorrectPassword999!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.data).toBeUndefined();
    });

    it('should return 401 INVALID_CREDENTIALS for non-existent email (enumeration prevention)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: `${testPrefix}_nonexistent@example.com`,
          password: 'AnyPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.data).toBeUndefined();
    });

    it('should reject login request with missing password or invalid email (400 VALIDATION_ERROR)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'not-valid-email',
        password: '',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Unique Race Condition & P2002 handling', () => {
    it('should handle Prisma P2002 error in AuthService and return 409 EMAIL_ALREADY_EXISTS', async () => {
      const mockUserRepo = {
        findByEmail: async () => null, // simulate passed findByEmail check
        findById: async () => null,
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`email`)',
            {
              code: 'P2002',
              clientVersion: '6.19.3',
              meta: { target: ['email'] },
            },
          );
        },
      } as unknown as UserRepository;

      const service = new AuthService(mockUserRepo);

      await expect(
        service.register({
          email: 'race@example.com',
          password: 'Password123!',
          fullName: 'Race User',
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
      });
    });
  });

  describe('JWT Expiration and Security', () => {
    it('should reject expired JWT token', () => {
      // Generate token expired in the past (-10 seconds)
      const expiredToken = generateToken(
        { sub: 'test-user-id', role: Role.CUSTOMER },
        { expiresIn: -10 },
      );

      expect(() => verifyToken(expiredToken)).toThrow();
    });

    it('should never include passwordHash in generated JWT token', () => {
      const token = generateToken({ sub: 'test-id', role: Role.CUSTOMER });
      const decoded = verifyToken<Record<string, unknown>>(token);

      expect(decoded.passwordHash).toBeUndefined();
      expect(decoded.password).toBeUndefined();
    });
  });
});
