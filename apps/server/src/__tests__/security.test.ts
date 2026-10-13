import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { userRepository } from '../repositories/user.repository.js';
import { hashPassword } from '../utils/password.util.js';
import { Role } from '@prisma/client';
import { ENV } from '../config/env.config.js';

// Prevent real DB connection
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

describe('Security Regressions (CWB-33)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rate Limiting on /api/v1/auth/login (AC: Chặn sau 10 lần login sai liên tiếp)', () => {
    const sendFailedLogins = async (ip: string, count: number) => {
      vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
      for (let i = 0; i < count; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', ip)
          .send({
            email: `failed-${i}@example.com`,
            password: 'WrongPassword123!',
          });
        expect(res.status).toBe(401);
      }
    };

    it('blocks subsequent attempts with 429 TOO_MANY_REQUESTS after 10 consecutive failed logins', async () => {
      const attackerIp = '192.168.1.100';

      // Perform 10 failed login attempts
      await sendFailedLogins(attackerIp, 10);

      // 11th failed attempt should be rate limited with 429
      const blockedRes = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', attackerIp)
        .send({
          email: 'attacker11@example.com',
          password: 'WrongPassword123!',
        });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.code).toBe('TOO_MANY_REQUESTS');
      expect(blockedRes.body.message).toContain('Quá nhiều lần đăng nhập');
    });

    it('resets the consecutive counter upon a successful login so subsequent attempts are not blocked', async () => {
      const validPassword = 'CorrectPassword123!';
      const passwordHash = await hashPassword(validPassword);
      const userIp = '192.168.1.101';

      // 1. Fail 5 times
      await sendFailedLogins(userIp, 5);

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

      const successRes = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', userIp)
        .send({
          email: 'user@example.com',
          password: validPassword,
        });
      expect(successRes.status).toBe(200);
      expect(successRes.body.success).toBe(true);

      // 3. Fail another 5 times: should not trigger 429 because success reset the consecutive counter
      await sendFailedLogins(userIp, 5);
    });

    it('does not count client validation errors (400) toward the failed login rate limit', async () => {
      const clientIp = '192.168.1.102';

      // 10 malformed requests rejected by Zod before reaching the authentication handler
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', clientIp)
          .send({
            email: 'not-an-email',
            password: '',
          });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }

      // Legitimate attempt after 10 validation errors should NOT be rate-limited
      vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
      const legitimateAttempt = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', clientIp)
        .send({
          email: 'valid@example.com',
          password: 'SomePassword123!',
        });

      expect(legitimateAttempt.status).toBe(401);
      expect(legitimateAttempt.body.code).toBe('INVALID_CREDENTIALS');
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
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', '192.168.1.103')
          .send({
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
      const allowedRes = await request(app)
        .get('/health')
        .set('Origin', ENV.CLIENT_URL);

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
