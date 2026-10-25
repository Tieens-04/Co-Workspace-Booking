import { afterEach, expect, it, vi } from 'vitest';
import './support/integration-media.js';
import { v2 as cloudinary } from 'cloudinary';

afterEach(() => vi.unstubAllEnvs());

it('overrides inherited external service credentials before application configuration loads', async () => {
  for (const key of [
    'SMTP_USER',
    'SMTP_PASS',
    'GMAIL_USER',
    'GMAIL_APP_PASSWORD',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ]) {
    vi.stubEnv(key, 'inherited-account');
  }
  vi.resetModules();
  await import('./support/disable-external-services.js');
  for (const key of ['SMTP_USER', 'SMTP_PASS', 'GMAIL_USER', 'GMAIL_APP_PASSWORD']) {
    expect(process.env[key]).toBe('');
  }
  expect(process.env.CLOUDINARY_CLOUD_NAME).toBe('dummy-cloud-name');
  expect(process.env.CLOUDINARY_API_KEY).toBe('dummy-api-key');
  expect(process.env.CLOUDINARY_API_SECRET).toBe('dummy-api-secret');
});

it('blocks uploads and substitutes Cloudinary deletion without network calls', async () => {
  expect(vi.isMockFunction(cloudinary.uploader.upload_stream)).toBe(true);
  expect(() => cloudinary.uploader.upload_stream()).toThrow('mocked explicitly');
  expect(vi.isMockFunction(cloudinary.uploader.destroy)).toBe(true);
  await expect(cloudinary.uploader.destroy('test-asset')).resolves.toEqual({ result: 'ok' });
});
