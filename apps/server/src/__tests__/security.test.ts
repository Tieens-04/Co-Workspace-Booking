import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipKeyGenerator } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import app from '../app.js';
import { userRepository } from '../repositories/user.repository.js';
import express from 'express';
import { Role, User } from '@prisma/client';
import { ENV } from '../config/env.config.js';
import {
  loginEmailRateLimiter,
  loginIpRateLimiter,
  loginRateLimiter,
} from '../middlewares/rate-limit.middleware.js';

// Prevent real DB connection
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

describe('Security Regressions (CWB-33, CWB-37, CWB-108)', () => {
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
  const sprayedIps = Array.from({ length: 30 }, (_, i) => `203.0.113.${i + 1}`);
  const mixedEmails = Array.from({ length: 6 }, (_, i) => `mixed-${i}@example.com`);
  const loginEmails = [
    'failed@example.com',
    'user@example.com',
    'victim@example.com',
    'attacker@example.com',
    'spray@example.com',
    'owner@example.com',
    'other@example.com',
    'normalized@example.com',
    '', // key used when the body carries no usable email
    ...mixedEmails,
  ];
  const validPassword = 'CorrectPassword123!';
  const users = new Map<string, User>();

  const userFixture = (email: string, passwordHash: string): User => ({
    id: `id-${email}`,
    email,
    fullName: 'Legitimate User',
    phoneNumber: null,
    role: Role.CUSTOMER,
    passwordHash,
    tokenVersion: 0,
    lockedAt: null,
    lockReason: null,
    emailVerifiedAt: new Date(),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    app.set('trust proxy', false);
    users.clear();
    vi.spyOn(userRepository, 'findByEmail').mockImplementation(
      async (email: string) => users.get(email) ?? null,
    );
    // Reset actual store keys; forged headers must never isolate test counters.
    for (const address of [...clientAddresses, ...sprayedIps]) {
      const ipKey = ipKeyGenerator(address, 56);
      await loginIpRateLimiter.resetKey(ipKey);
      for (const email of loginEmails) {
        await loginRateLimiter.resetKey(`${ipKey}:${email}`);
      }
    }
    for (const email of loginEmails) {
      await loginEmailRateLimiter.resetKey(email);
    }
  });

  afterEach(() => {
    app.set('trust proxy', ENV.TRUST_PROXY);
  });

  describe('Rate Limiting on /api/v1/auth/login (AC: Chặn sau 10 lần login sai liên tiếp)', () => {
    const sendLogin = (
      forwardedFor?: string,
      email = 'failed@example.com',
      password = 'WrongPassword123!',
    ) => {
      const pending = request(app).post('/api/v1/auth/login');
      if (forwardedFor !== undefined) pending.set('X-Forwarded-For', forwardedFor);
      return pending.send({ email, password });
    };

    const sendFailedLogins = async (count: number, forwardedFor?: string, email?: string) => {
      for (let i = 0; i < count; i++) {
        const res = await sendLogin(forwardedFor, email);
        expect(res.status).toBe(401);
      }
    };

    const registerUser = async (email: string) => {
      users.set(email, userFixture(email, 'stubbed-password-hash'));
    };

    // These tests assert counter behaviour, not hashing: skip ~100 real bcrypt rounds.
    // Real bcrypt stays covered by the auth tests and the dummy-hash tests below.
    beforeEach(() => {
      vi.spyOn(bcrypt, 'compare').mockImplementation(
        (async (password: string) => password === validPassword) as never,
      );
    });

    const expectTooManyRequests = (res: { status: number; body: any }) => {
      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('TOO_MANY_REQUESTS');
    };

    // CWB-108 [R1-01]: requests rejected by one limiter must not be billed to the others.
    it('does not bill throttled (429) requests to the per-email or per-IP allowance', async () => {
      app.set('trust proxy', 1);
      await registerUser('victim@example.com');
      const attackerIp = '198.51.100.10';

      await sendFailedLogins(10, attackerIp, 'victim@example.com');
      for (let i = 0; i < 40; i++) {
        expectTooManyRequests(await sendLogin(attackerIp, 'victim@example.com'));
      }

      // The real owner, from another network, is not locked out by the attacker's retries.
      const ownerLogin = await sendLogin('198.51.100.11', 'victim@example.com', validPassword);
      expect(ownerLogin.status).toBe(200);
      // Other accounts behind the attacker's NAT address still reach authentication.
      expect((await sendLogin(attackerIp, 'other@example.com')).status).toBe(401);
    });

    it('does not bill server errors (5xx) to the failed-login allowance', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(userRepository, 'findByEmail').mockRejectedValue(new Error('database unavailable'));

      for (let i = 0; i < 12; i++) {
        expect((await sendLogin()).status).toBe(500);
      }

      vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
      expect((await sendLogin()).status).toBe(401);
    });

    // CWB-108 [R1-02]: the store's post-response decrement must not resurrect a cleared key.
    it('leaves no counter behind after a successful login clears it', async () => {
      await registerUser('owner@example.com');
      await sendFailedLogins(3, undefined, 'owner@example.com');

      expect((await sendLogin(undefined, 'owner@example.com', validPassword)).status).toBe(200);
      await new Promise((resolve) => setImmediate(resolve)); // let post-response hooks settle

      for (const address of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
        const ipKey = ipKeyGenerator(address, 56);
        expect(await loginRateLimiter.getKey(`${ipKey}:owner@example.com`)).toBeUndefined();
      }
      expect(await loginEmailRateLimiter.getKey('owner@example.com')).toBeUndefined();
    });

    // CWB-108 [R1-03]: one counter per account regardless of how the email is typed.
    it('shares one counter across email case and whitespace variants', async () => {
      await sendFailedLogins(5, undefined, 'normalized@example.com');
      await sendFailedLogins(5, undefined, '  NORMALIZED@Example.COM  ');

      expectTooManyRequests(await sendLogin(undefined, ' Normalized@EXAMPLE.com'));
    });

    it('keys by the normalized email and tolerates a missing email when used standalone', async () => {
      const standalone = express();
      standalone.set('trust proxy', 1);
      standalone.use(express.json());
      standalone.post('/login', loginRateLimiter, (_req, res) => {
        res.status(401).json({ success: false });
      });
      const post = (body?: object) =>
        request(standalone).post('/login').set('X-Forwarded-For', sprayedIps[0]).send(body);

      for (let i = 0; i < 5; i++) {
        expect((await post({ email: 'normalized@example.com' })).status).toBe(401);
        expect((await post({ email: '  NORMALIZED@example.com  ' })).status).toBe(401);
      }
      expect((await post({ email: 'Normalized@Example.com' })).status).toBe(429);

      // No usable email (missing or non-string) falls into one shared bucket instead of throwing.
      expect((await post()).status).toBe(401);
      expect((await post({ email: { $ne: null } })).status).toBe(401);
    });

    // CWB-108: a success on account B must never erase the failure counter built against account A.
    it('does not reset the failed-login counter of account A when account B logs in from the same IP', async () => {
      await registerUser('attacker@example.com');

      await sendFailedLogins(9, undefined, 'victim@example.com');
      const ownLogin = await sendLogin(undefined, 'attacker@example.com', validPassword);
      expect(ownLogin.status).toBe(200);

      expect((await sendLogin(undefined, 'victim@example.com')).status).toBe(401);
      expectTooManyRequests(await sendLogin(undefined, 'victim@example.com'));
    });

    it('caps failed logins per IP across many emails and never lets a success reset that cap', async () => {
      app.set('trust proxy', 1);
      await registerUser('owner@example.com');
      const attackerIp = '198.51.100.10';

      // 5 emails x 9 failures stay below the per-email (20) and per-IP+email (10) limits.
      for (const email of mixedEmails.slice(0, 5)) {
        await sendFailedLogins(9, attackerIp, email);
      }
      // A legitimate success from the same IP must not wipe the IP-wide counter (45 failures).
      expect((await sendLogin(attackerIp, 'owner@example.com', validPassword)).status).toBe(200);
      await sendFailedLogins(5, attackerIp, mixedEmails[5]); // 50th failure: still allowed

      expectTooManyRequests(await sendLogin(attackerIp, mixedEmails[5]));
      expect((await sendLogin('198.51.100.11', mixedEmails[5])).status).toBe(401);
    });

    it('limits failed logins per email across many IPs (distributed guessing)', async () => {
      app.set('trust proxy', 1);

      for (const ip of sprayedIps.slice(0, 20)) {
        expect((await sendLogin(ip, 'spray@example.com')).status).toBe(401);
      }
      const blocked = await sendLogin(sprayedIps[20], 'spray@example.com');
      expectTooManyRequests(blocked);
      // Another account from a fresh IP is unaffected.
      expect((await sendLogin(sprayedIps[21], 'other@example.com')).status).toBe(401);
    });

    it('lets the account owner clear the per-email counter with a successful login', async () => {
      app.set('trust proxy', 1);
      await registerUser('owner@example.com');

      for (const ip of sprayedIps.slice(0, 19)) {
        expect((await sendLogin(ip, 'owner@example.com')).status).toBe(401);
      }
      expect((await sendLogin(sprayedIps[29], 'owner@example.com', validPassword)).status).toBe(
        200,
      );

      for (const ip of sprayedIps.slice(0, 20)) {
        expect((await sendLogin(ip, 'owner@example.com')).status).toBe(401);
      }
      expectTooManyRequests(await sendLogin(sprayedIps[20], 'owner@example.com'));
    });

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
        const userIp = proxy ? '2001:db8:abcd:1200::1' : undefined;
        const nextIp = proxy ? '2001:db8:abcd:12ff::2' : undefined;
        app.set('trust proxy', proxy ? 1 : false);
        await registerUser('user@example.com');

        // 1. Fail 5 times against the account
        await sendFailedLogins(5, userIp, 'user@example.com');

        // 2. The account owner logs in successfully once (same /56 network)
        const successRes = await sendLogin(nextIp, 'user@example.com', validPassword);
        expect(successRes.status).toBe(200);
        expect(successRes.body.success).toBe(true);

        // A fresh allowance of exactly 10 failures must remain after success.
        await sendFailedLogins(10, nextIp, 'user@example.com');
        expect((await sendLogin(userIp, 'user@example.com')).status).toBe(429);
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

  describe('Timing-safe dummy hash (CWB-108)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    // Runs the real login flow with real bcrypt (no compare mock): a missing user and an
    // anonymized (soft-deleted) user must both burn one comparison against the dummy hash.
    const loginAgainstUnusableAccounts = async (saltRounds: string) => {
      vi.stubEnv('BCRYPT_SALT_ROUNDS', saltRounds);
      vi.resetModules();
      const compare = vi.spyOn(bcrypt, 'compare');
      const { AuthService } = await import('../services/auth.service.js');
      const anonymized = {
        ...userFixture('anonymized@example.com', 'unused'),
        deletedAt: new Date(),
      };
      const findByEmail = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(anonymized);
      const service = new AuthService({ findByEmail } as never);

      for (const email of ['ghost@example.com', 'anonymized@example.com']) {
        await expect(service.login({ email, password: 'any-password' })).rejects.toMatchObject({
          code: 'INVALID_CREDENTIALS',
          statusCode: 401,
        });
      }
      return compare.mock.calls.map(([, hash]) => hash as string);
    };

    it.each(['10', '12'])(
      'compares missing and anonymized users against one valid hash built with BCRYPT_SALT_ROUNDS=%s',
      async (saltRounds) => {
        const hashes = await loginAgainstUnusableAccounts(saltRounds);

        expect(hashes).toHaveLength(2);
        expect(hashes[0]).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
        expect(hashes[1]).toBe(hashes[0]); // generated once at module load, not per request
        expect(bcrypt.getRounds(hashes[0])).toBe(Number(saltRounds));
      },
    );
  });
});
