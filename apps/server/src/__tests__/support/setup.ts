import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_SALT_ROUNDS = '10';
process.env.CLOUDINARY_CLOUD_NAME = 'dummy-cloud-name';
process.env.CLOUDINARY_API_KEY = 'dummy-api-key';
process.env.CLOUDINARY_API_SECRET = 'dummy-api-secret';
// Unit/HTTP tests must never inherit the developer's connection string.
process.env.DATABASE_URL = 'mysql://unused:unused@127.0.0.1:1/disabled_test';
