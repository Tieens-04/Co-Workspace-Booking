import { vi } from 'vitest';

// Keep the real SDK interface, but never allow integration tests to contact Cloudinary.
vi.mock('cloudinary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('cloudinary')>();
  return {
    ...actual,
    v2: {
      ...actual.v2,
      uploader: {
        ...actual.v2.uploader,
        upload_stream: vi.fn(() => {
          throw new Error('Cloudinary uploads must be mocked explicitly in integration tests.');
        }),
        destroy: vi.fn().mockResolvedValue({ result: 'ok' }),
      },
    },
  };
});
