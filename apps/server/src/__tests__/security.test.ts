import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipKeyGenerator } from 'express-rate-limit';
import request from 'supertest';
import app from '../app.js';
import { userRepository } from '../repositories/user.repository.js';
import { hashPassword } from '../utils/password.util.js';
import { Role } from '@prisma/client';
import { ENV } from '../config/env.config.js';
import { loginRateLimiter } from '../middlewares/rate-limit.middleware.js';

// Prevent real DB connection
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

describe('Security Regressions (CWB-33, CWB-37)', () => {
  const clientAddresses = [
    '127.0.0.1',
    '::ffff:127.0.0.1',
    '::1',
    '198.51.100.10',
    '198.51.100.11',
    '2001:db8:abcd:1200::1',
    '2001:0db8:abcd:1200:0000:0000:0000:0001',
    '2001:db8:abcd:12ff::2',
    '2001:db8:abcd:1300::1',
  ];

  beforeEach(async () => {
    vi.restoreAllMocks();
    app.set('trust proxy', false);
    // Reset actual store keys; forged headers must never isolate test counters.
    for (const address of clientAddresses) {
      await loginRateLimiter.resetKey(address);
      await loginRateLimiter.resetKey(ipKeyGenerator(address, 56));
    }
  });

  afterEach(() => {
    app.set('trust proxy', ENV.TRUST_PROXY);
  });

  describe('Rate Limiting on /api/v1/auth/login (AC: Chặn sau 10 lần login sai liên tiếp)', () => {
    const sendLogin = (forwardedFor?: string) => {
      const pending = request(app).post('/api/v1/auth/login');
      if (forwardedFor !== undefined) pending.set('X-Forwarded-For', forwardedFor);
      return pending.send({ email: 'failed@example.com', password: 'WrongPassword123!' });
    };

    const sendFailedLogins = async (count: number, forwardedFor?: string) => {
      vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
      for (let i = 0; i < count; i++) {
        const res = await sendLogin(forwardedFor);
        expect(res.status).toBe(401);
      }
    };

    it('blocks subsequent attempts with 429 TOO_MANY_REQUESTS after 10 consecutive failed logins', async () => {
      // Perform 10 failed login attempts
      await sendFailedLogins(10);

      // 11th failed attempt should be rate limited with 429
      const blockedRes = await sendLogin();

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.code).toBe('TOO_MANY_REQUESTS');
      expect(blockedRes.body.message).toContain('Quá nhiều lần đăng nhập');
      expect(blockedRes.headers['ratelimit-limit']).toBe('10');
      expect(blockedRes.headers['ratelimit-remaining']).toBe('0');
      expect(Number(blockedRes.headers['retry-after'])).toBeGreaterThan(0);
      expect(blockedRes.headers['x-ratelimit-limit']).toBeUndefined();
    });

    it.each([
      undefined,
      '198.51.100.11',
      '198.51.100.11, 203.0.113.20',
      '203.0.113.20, 198.51.100.11',
    ])('cannot bypass a direct connection limit using X-Forwarded-For=%s', async (header) => {
      await sendFailedLogins(10, '198.51.100.10');
      expect((await sendLogin(header)).status).toBe(429);
      expect(userRepository.findByEmail).toHaveBeenCalledTimes(10);
    });

    it('ignores forged prefixes behind one proxy and keeps real clients independent', async () => {
      app.set('trust proxy', 1);
      await sendFailedLogins(10, '203.0.113.1, 198.51.100.10');

      expect((await sendLogin('203.0.113.2, 198.51.100.10')).status).toBe(429);
      expect((await sendLogin('203.0.113.3, 203.0.113.4, 198.51.100.10')).status).toBe(429);
      expect((await sendLogin('198.51.100.10')).status).toBe(429);
      expect((await sendLogin('198.51.100.11')).status).toBe(401);
    });

    it('shares an IPv6 /56 counter across spellings and addresses but not other subnets', async () => {
      app.set('trust proxy', 1);
      await sendFailedLogins(10, '2001:db8:abcd:1200::1');

      expect((await sendLogin('2001:0db8:abcd:1200:0000:0000:0000:0001')).status).toBe(429);
      expect((await sendLogin('2001:db8:abcd:12ff::2')).status).toBe(429);
      expect((await sendLogin('2001:db8:abcd:1300::1')).status).toBe(401);
    });

    it.each([false, true])(
      'resets the normalized counter after success (IPv6 proxy=%s)',
      async (proxy) => {
        const validPassword = 'CorrectPassword123!';
        const passwordHash = await hashPassword(validPassword);
        app.set('trust proxy', proxy ? 1 : false);
        const userIp = proxy ? '2001:db8:abcd:1200::1' : undefined;
        const nextIp = proxy ? '2001:db8:abcd:12ff::2' : undefined;

        // 1. Fail 5 times
        await sendFailedLogins(5, userIp);

        // 2. Login successfully once
        vi.spyOn(userRepository, 'findByEmail').mockResolvedValue({
          id: 'legit-user-id',
          email: 'user@example.com',
          fullName: 'Legitimate User',
          phoneNumber: null,
          role: Role.CUSTOMER,
          passwordHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const successfulLogin = request(app).post('/api/v1/auth/login');
        if (nextIp !== undefined) successfulLogin.set('X-Forwarded-For', nextIp);
        const successRes = await successfulLogin.send({
          email: 'user@example.com',
          password: validPassword,
        });
        expect(successRes.status).toBe(200);
        expect(successRes.body.success).toBe(true);

        // A fresh allowance of exactly 10 failures must remain after success.
        await sendFailedLogins(10, nextIp);
        expect((await sendLogin(userIp)).status).toBe(429);
      },
    );

    it('does not count client validation errors (400) toward the failed login rate limit', async () => {
      // 10 malformed requests rejected by Zod before reaching the authentication handler
      for (let i = 0; i < 10; i++) {
        const res = await request(app).post('/api/v1/auth/login').send({
          email: 'not-an-email',
          password: '',
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }

      // Legitimate attempt after 10 validation errors should NOT be rate-limited
      await sendFailedLogins(10);
      expect((await sendLogin()).status).toBe(429);
    });
  });

  describe('SQL Injection Prevention (AC: Không thể inject SQL qua input)', () => {
    it('handles SQL injection payloads safely across auth endpoints without syntax errors or leakage', async () => {
      vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);

      const sqlPayloads = [
        "' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM users --",
        "'; DROP TABLE users; --",
      ];

      for (const payload of sqlPayloads) {
        const res = await request(app).post('/api/v1/auth/login').send({
          email: payload,
          password: payload,
        });

        expect([400, 401]).toContain(res.status);
        expect(res.body.success).toBe(false);
        expect(JSON.stringify(res.body)).not.toContain('syntax error');
        expect(JSON.stringify(res.body)).not.toContain('SQLSTATE');
      }
    });
  });

  describe('CORS and Security Headers Review', () => {
    it('sets appropriate CORS headers for authorized origin and rejects unauthorized origins', async () => {
      const allowedRes = await request(app).get('/health').set('Origin', ENV.CLIENT_URL);

      expect(allowedRes.headers['access-control-allow-origin']).toBe(ENV.CLIENT_URL);
      expect(allowedRes.headers['access-control-allow-credentials']).toBe('true');

      const unauthorizedRes = await request(app)
        .get('/health')
        .set('Origin', 'http://unauthorized-malicious-site.com');

      expect(unauthorizedRes.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('sets standard security headers via helmet', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
