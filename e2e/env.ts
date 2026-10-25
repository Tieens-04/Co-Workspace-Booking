import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { validateTestDatabase } from '../apps/server/src/__tests__/support/test-database.js';

export const API_URL = 'http://127.0.0.1:5001';
export const WEB_URL = 'http://127.0.0.1:5174';

function fileEnvironment(path: string): Record<string, string> {
  return existsSync(path) ? dotenv.parse(readFileSync(path)) : {};
}

/** Read configuration without replacing the caller's development DATABASE_URL. */
export function testDatabaseUrl(): string {
  const root = fileEnvironment(resolve('.env'));
  const server = fileEnvironment(resolve('apps/server/.env'));
  const target =
    process.env.TEST_DATABASE_URL ?? server.TEST_DATABASE_URL ?? root.TEST_DATABASE_URL;
  const developmentUrls = [process.env.DATABASE_URL, server.DATABASE_URL, root.DATABASE_URL];
  for (const development of developmentUrls) validateTestDatabase(target, development);
  return validateTestDatabase(target);
}

/** Explicit values prevent dotenv from restoring a developer's external credentials. */
export function serverEnvironment(): Record<string, string | undefined> {
  return {
    ...process.env,
    DATABASE_URL: testDatabaseUrl(),
    NODE_ENV: 'test',
    PORT: '5001',
    CLIENT_URL: WEB_URL,
    TRUST_PROXY: 'false',
    JWT_SECRET: 'cwb49-disposable-browser-test-key-at-least-32-characters',
    JWT_EXPIRES_IN: '1h',
    BCRYPT_SALT_ROUNDS: '10',
    CLOUDINARY_CLOUD_NAME: 'e2e-unused',
    CLOUDINARY_API_KEY: 'e2e-unused',
    CLOUDINARY_API_SECRET: 'e2e-unused',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: 'browser-test@example.com',
    GMAIL_USER: '',
    GMAIL_APP_PASSWORD: '',
    EMAIL_FROM: '',
  };
}
