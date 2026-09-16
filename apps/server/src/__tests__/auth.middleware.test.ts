import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { ENV } from '../config/env.config.js';
import { errorHandler } from '../middlewares/error.middleware.js';
import { verifyToken, checkRole } from '../middlewares/auth.middleware.js';

// Prevent any unexpected DB access in unit tests
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

describe('Auth & RBAC Middleware', () => {
  const adminToken = generateToken({ sub: 'admin-uuid-1', role: Role.ADMIN });
  const customerToken = generateToken({ sub: 'customer-uuid-1', role: Role.CUSTOMER });

  describe('Real App Route Wiring (/api/v1/admin, /api/v1/me, public routes)', () => {
    it('returns 401 UNAUTHORIZED when no token is provided to /api/v1/admin', async () => {
      const res = await request(app).get('/api/v1/admin');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để tiếp tục',
      });
    });

    it('returns 401 UNAUTHORIZED when no token is provided to /api/v1/me', async () => {
      const res = await request(app).get('/api/v1/me');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để tiếp tục',
      });
    });

    it('returns 403 FORBIDDEN when CUSTOMER accesses /api/v1/admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
    });

    it('returns 404 when ADMIN accesses /api/v1/admin because endpoints are not yet defined', async () => {
      const res = await request(app)
        .get('/api/v1/admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 when CUSTOMER accesses /api/v1/me because endpoints are not yet defined', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 when ADMIN accesses /api/v1/me because endpoints are not yet defined', async () => {
      const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('regression: public routes (/health, /auth/login, /auth/register) remain accessible without token', async () => {
      const healthRes = await request(app).get('/api/v1/health');
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.success).toBe(true);

      const loginRes = await request(app).post('/api/v1/auth/login').send({});
      // Public route passes auth middleware; rejected by body validator with 400
      expect(loginRes.status).toBe(400);
      expect(loginRes.body.code).toBe('VALIDATION_ERROR');

      const registerRes = await request(app).post('/api/v1/auth/register').send({});
      expect(registerRes.status).toBe(400);
      expect(registerRes.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Test-Only Guarded Endpoints (Verifying 200 OK for allowed roles)', () => {
    const testApp = express();
    testApp.use(express.json());

    // Admin protected endpoint
    testApp.get(
      '/test-admin',
      verifyToken,
      checkRole([Role.ADMIN]),
      (req: Request, res: Response) => {
        res.status(200).json({ success: true, data: { user: req.user } });
      },
    );

    // Personal protected endpoint (accessible by both CUSTOMER and ADMIN)
    testApp.get('/test-me', verifyToken, (req: Request, res: Response) => {
      res.status(200).json({ success: true, data: { user: req.user } });
    });

    testApp.use(errorHandler);

    it.each(['Bearer', 'bearer', 'BEARER', 'bEaReR'])(
      'allows ADMIN to access admin endpoint with the %s scheme',
      async (scheme) => {
        const res = await request(testApp)
          .get('/test-admin')
          .set('Authorization', `${scheme} ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.user).toEqual({
          sub: 'admin-uuid-1',
          role: 'ADMIN',
        });
      },
    );

    it('allows CUSTOMER to access personal endpoint with 200 OK', async () => {
      const res = await request(testApp)
        .get('/test-me')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({
        sub: 'customer-uuid-1',
        role: 'CUSTOMER',
      });
    });

    it('allows ADMIN to access personal endpoint with 200 OK', async () => {
      const res = await request(testApp)
        .get('/test-me')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({
        sub: 'admin-uuid-1',
        role: 'ADMIN',
      });
    });
  });

  describe('Token & Header Malformation and Attack Vectors', () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.get('/protected', verifyToken, (req: Request, res: Response) => {
      res.status(200).json({ success: true, user: req.user });
    });
    testApp.use(errorHandler);

    it.each([
      ['empty authorization header', ''],
      ['non-Bearer scheme: Basic', 'Basic dXNlcjpwYXNz'],
      ['non-Bearer scheme: Token', `Token ${customerToken}`],
      ['bearer missing token', 'Bearer'],
      ['bearer with spaces only', 'Bearer    '],
    ])('rejects malformed authorization header: %s', async (_, headerValue) => {
      const res = await request(testApp).get('/protected').set('Authorization', headerValue);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
      expect(JSON.stringify(res.body)).not.toContain(customerToken);
    });

    it('rejects token with invalid signature', async () => {
      const foreignToken = jwt.sign(
        { sub: 'user-id', role: Role.CUSTOMER },
        'different-secret-that-is-at-least-32-chars-long!',
        { algorithm: 'HS256', expiresIn: '1h' },
      );
      const res = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      expect(res.body.message).toBe('Token không hợp lệ hoặc đã hết hạn');
    });

    it('returns 401 for a JWT with malformed payload JSON', async () => {
      const malformedToken = [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from('{bad').toString('base64url'),
        Buffer.from('fake-signature').toString('base64url'),
      ].join('.');

      const res = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${malformedToken}`);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Token không hợp lệ hoặc đã hết hạn',
      });
    });

    it('preserves 500 for unexpected verifier errors', async () => {
      const verifySpy = vi.spyOn(jwt, 'verify').mockImplementationOnce(() => {
        throw new Error('Unexpected verifier failure');
      });
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const res = await request(testApp)
          .get('/protected')
          .set('Authorization', `Bearer ${customerToken}`);

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
          success: false,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Đã có lỗi xảy ra trên hệ thống',
        });
      } finally {
        verifySpy.mockRestore();
        logSpy.mockRestore();
      }
    });

    it('rejects expired token', async () => {
      const expiredToken = generateToken(
        { sub: 'user-id', role: Role.CUSTOMER },
        { expiresIn: -10 },
      );
      const res = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      expect(res.body.message).toBe('Token không hợp lệ hoặc đã hết hạn');
    });

    it('rejects tampered token payload (e.g. customer elevating to admin)', async () => {
      const originalToken = generateToken({ sub: 'user-id', role: Role.CUSTOMER });
      const parts = originalToken.split('.');
      // Tamper payload to ADMIN without signature re-computation
      parts[1] = Buffer.from(JSON.stringify({ sub: 'user-id', role: Role.ADMIN })).toString(
        'base64url',
      );
      const tamperedToken = parts.join('.');

      const res = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${tamperedToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('rejects token using disallowed algorithm "none"', async () => {
      const noneToken = jwt.sign({ sub: 'user-id', role: Role.CUSTOMER }, '', {
        algorithm: 'none',
      });
      const res = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${noneToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('rejects token using disallowed algorithm "HS384"', async () => {
      const hs384Token = jwt.sign({ sub: 'user-id', role: Role.CUSTOMER }, ENV.JWT_SECRET, {
        algorithm: 'HS384',
        expiresIn: '1h',
      });
      const res = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${hs384Token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Runtime Validation of Verified Claims (sub, role, exp)', () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.get('/protected', verifyToken, (req: Request, res: Response) => {
      res.status(200).json({ success: true, user: req.user });
    });
    testApp.use(errorHandler);

    it.each([
      ['empty sub string', { sub: '', role: Role.CUSTOMER }],
      ['whitespace sub string', { sub: '   ', role: Role.CUSTOMER }],
      ['numeric sub', { sub: 12345, role: Role.CUSTOMER }],
      ['sub is null', { sub: null, role: Role.CUSTOMER }],
    ])('rejects token with invalid sub claim: %s', async (_, payload) => {
      const token = jwt.sign(payload, ENV.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
      const res = await request(testApp).get('/protected').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it.each([
      ['role not in enum: SUPERADMIN', { sub: 'user-1', role: 'SUPERADMIN' }],
      ['role not in enum: GUEST', { sub: 'user-1', role: 'GUEST' }],
      ['role lowercase: admin', { sub: 'user-1', role: 'admin' }],
      ['role is null', { sub: 'user-1', role: null }],
    ])('rejects token with invalid role claim: %s', async (_, payload) => {
      const token = jwt.sign(payload, ENV.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
      const res = await request(testApp).get('/protected').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('rejects token without exp claim (no expiration set)', async () => {
      const token = jwt.sign({ sub: 'user-1', role: Role.CUSTOMER }, ENV.JWT_SECRET, {
        algorithm: 'HS256',
        noTimestamp: true,
      });
      const res = await request(testApp).get('/protected').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('checkRole Middleware Unit & Edge Cases', () => {
    it('returns 401 UNAUTHORIZED when checkRole is invoked without verifyToken (no req.user)', async () => {
      const testApp = express();
      testApp.get('/unverified-role', checkRole([Role.ADMIN]), (_req, res) => {
        res.status(200).json({ ok: true });
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get('/unverified-role');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để tiếp tục',
      });
    });

    it('returns 403 FORBIDDEN when allowedRoles is empty (no role allowed)', async () => {
      const testApp = express();
      testApp.get('/empty-roles', verifyToken, checkRole([]), (_req, res) => {
        res.status(200).json({ ok: true });
      });
      testApp.use(errorHandler);

      const res = await request(testApp)
        .get('/empty-roles')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
    });

    it('returns 403 FORBIDDEN when user role is not in allowed list', async () => {
      const testApp = express();
      testApp.get('/admin-only', verifyToken, checkRole([Role.ADMIN]), (_req, res) => {
        res.status(200).json({ ok: true });
      });
      testApp.use(errorHandler);

      const res = await request(testApp)
        .get('/admin-only')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('Spoofing Protection and Security Invariants', () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.post(
      '/secure-action',
      verifyToken,
      checkRole([Role.CUSTOMER]),
      (req: Request, res: Response) => {
        res.status(200).json({
          success: true,
          user: req.user,
          body: req.body,
          query: req.query,
        });
      },
    );
    testApp.use(errorHandler);

    it('ignores client-supplied userId and role in body or query params and relies strictly on JWT claims', async () => {
      const res = await request(testApp)
        .post('/secure-action?role=ADMIN&userId=hacker-uuid')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          role: 'ADMIN',
          userId: 'attacker-uuid-999',
          sub: 'spoofed-sub',
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({
        sub: 'customer-uuid-1',
        role: 'CUSTOMER',
      });
      expect(res.body.user.role).toBe('CUSTOMER');
      expect(res.body.user.sub).toBe('customer-uuid-1');
    });

    it('ensures error response contract never leaks token, secret, or stack traces', async () => {
      const res = await request(testApp)
        .post('/secure-action')
        .set('Authorization', 'Bearer invalid.token.payload');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Token không hợp lệ hoặc đã hết hạn',
      });
      expect(res.body.details).toBeUndefined();
      expect(res.body.stack).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('invalid.token.payload');
    });
  });
});
