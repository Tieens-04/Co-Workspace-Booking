import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { validateTestDatabase } from './test-database.js';

dotenv.config();
process.env.DATABASE_URL = validateTestDatabase(
  process.env.TEST_DATABASE_URL,
  process.env.DATABASE_URL,
);
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_SALT_ROUNDS = '10';
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'dummy-cloud-name';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'dummy-api-key';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'dummy-api-secret';
