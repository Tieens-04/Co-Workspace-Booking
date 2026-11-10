import dotenv from 'dotenv';
import { smtpConfigFromEnv } from './smtp.config.js';
import { parsePaymentConfig, type PaymentAccount } from './payment.config.js';
dotenv.config();

const rawTrustProxy = process.env.TRUST_PROXY;
if (rawTrustProxy !== undefined && rawTrustProxy !== 'true' && rawTrustProxy !== 'false') {
  throw new Error('TRUST_PROXY must be true or false when specified.');
}

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

// Must stay below the orchestrator stop grace period (docker compose stop_grace_period: 30s).
const rawShutdownTimeout = process.env.SHUTDOWN_TIMEOUT_MS;
const shutdownTimeoutMs = rawShutdownTimeout ? Number(rawShutdownTimeout) : 20000;
if (
  !Number.isInteger(shutdownTimeoutMs) ||
  shutdownTimeoutMs < 1000 ||
  shutdownTimeoutMs > 120000
) {
  throw new Error('SHUTDOWN_TIMEOUT_MS must be an integer between 1000 and 120000.');
}

// CWB-75: how far ahead a booking may start (customer and admin guest bookings alike).
const rawMaxAdvanceDays = process.env.BOOKING_MAX_ADVANCE_DAYS?.trim();
const bookingMaxAdvanceDays = rawMaxAdvanceDays ? Number(rawMaxAdvanceDays) : 60;
if (
  !Number.isInteger(bookingMaxAdvanceDays) ||
  bookingMaxAdvanceDays < 1 ||
  bookingMaxAdvanceDays > 365
) {
  throw new Error('BOOKING_MAX_ADVANCE_DAYS must be an integer between 1 and 365.');
}

// CWB-78: upcoming CONFIRMED bookings one customer may hold at once (admin guest bookings exempt).
const rawMaxActiveBookings = process.env.BOOKING_MAX_ACTIVE_PER_CUSTOMER?.trim();
const bookingMaxActivePerCustomer = rawMaxActiveBookings ? Number(rawMaxActiveBookings) : 5;
if (
  !Number.isInteger(bookingMaxActivePerCustomer) ||
  bookingMaxActivePerCustomer < 1 ||
  bookingMaxActivePerCustomer > 100
) {
  throw new Error('BOOKING_MAX_ACTIVE_PER_CUSTOMER must be an integer between 1 and 100.');
}

// CWB-80: reminder email this many hours before a booking starts.
const rawReminderHours = process.env.BOOKING_REMINDER_HOURS?.trim();
const bookingReminderHours = rawReminderHours ? Number(rawReminderHours) : 2;
if (
  !Number.isInteger(bookingReminderHours) ||
  bookingReminderHours < 1 ||
  bookingReminderHours > 48
) {
  throw new Error('BOOKING_REMINDER_HOURS must be an integer between 1 and 48.');
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
  // One trusted hop requires the backend to be reachable only through that proxy.
  TRUST_PROXY: rawTrustProxy === 'true' ? 1 : false,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN_SECONDS: jwtExpiresInSeconds,
  BCRYPT_SALT_ROUNDS: saltRounds,
  SHUTDOWN_TIMEOUT_MS: shutdownTimeoutMs,
  BOOKING_MAX_ADVANCE_DAYS: bookingMaxAdvanceDays,
  BOOKING_MAX_ACTIVE_PER_CUSTOMER: bookingMaxActivePerCustomer,
  BOOKING_REMINDER_HOURS: bookingReminderHours,
  CLOUDINARY_CLOUD_NAME: cloudinaryCloudName,
  CLOUDINARY_API_KEY: cloudinaryApiKey,
  CLOUDINARY_API_SECRET: cloudinaryApiSecret,
  SMTP: smtpConfigFromEnv(process.env),
  // CWB-89: receiving bank account for transfer instructions (null = counter payment only).
  PAYMENT: parsePaymentConfig(process.env) as PaymentAccount | null,
};
