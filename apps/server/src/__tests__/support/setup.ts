import { randomBytes } from 'node:crypto';
import { vi } from 'vitest';
import './disable-smtp.js';

process.env.NODE_ENV = 'test';
process.env.TRUST_PROXY = 'false';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_SALT_ROUNDS = '10';
process.env.CLOUDINARY_CLOUD_NAME = 'dummy-cloud-name';
process.env.CLOUDINARY_API_KEY = 'dummy-api-key';
process.env.CLOUDINARY_API_SECRET = 'dummy-api-secret';
// Unit/HTTP tests must never inherit the developer's connection string.
process.env.DATABASE_URL = 'mysql://unused:unused@127.0.0.1:1/disabled_test';

// Unit/HTTP tests run without a database, so the per-request token-version lookup (CWB-77) treats
// every correctly signed token as current. Revocation tests override this with mockResolvedValue;
// the real check is covered by the MySQL integration suite and session.service.test.ts.
vi.mock('../../services/session.service.js', () => ({
  SessionService: class {},
  sessionService: { isTokenCurrent: vi.fn(async () => true) },
}));
