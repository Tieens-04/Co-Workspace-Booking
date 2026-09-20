import dotenv from 'dotenv';
dotenv.config();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET is required and must be at least 32 characters long.');
}

const rawSaltRounds = process.env.BCRYPT_SALT_ROUNDS;
const saltRounds = rawSaltRounds ? Number(rawSaltRounds) : 10;
if (!Number.isInteger(saltRounds) || saltRounds < 10 || saltRounds > 14) {
  throw new Error('BCRYPT_SALT_ROUNDS must be an integer between 10 and 14.');
}

// Require explicit units to avoid JWT libraries interpreting bare strings as milliseconds.
const jwtLifetime = process.env.JWT_EXPIRES_IN ?? '1h';
const lifetimeMatch = /^(\d+)(s|m|h|d)$/.exec(jwtLifetime);
const unitSeconds: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
const jwtExpiresInSeconds = lifetimeMatch
  ? Number(lifetimeMatch[1]) * unitSeconds[lifetimeMatch[2]]
  : NaN;
if (!Number.isSafeInteger(jwtExpiresInSeconds) || jwtExpiresInSeconds <= 0) {
  throw new Error('JWT_EXPIRES_IN must be a positive integer duration with s, m, h or d units.');
}

const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
if (!cloudinaryCloudName) {
  throw new Error('CLOUDINARY_CLOUD_NAME is required.');
}

const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY?.trim();
if (!cloudinaryApiKey) {
  throw new Error('CLOUDINARY_API_KEY is required.');
}

const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
if (!cloudinaryApiSecret) {
  throw new Error('CLOUDINARY_API_SECRET is required.');
}

export const ENV = {
  PORT: process.env.PORT ? Number(process.env.PORT) : 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN_SECONDS: jwtExpiresInSeconds,
  BCRYPT_SALT_ROUNDS: saltRounds,
  CLOUDINARY_CLOUD_NAME: cloudinaryCloudName,
  CLOUDINARY_API_KEY: cloudinaryApiKey,
  CLOUDINARY_API_SECRET: cloudinaryApiSecret,
};
