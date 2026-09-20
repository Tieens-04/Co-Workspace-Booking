import { describe, it, expect } from 'vitest';
import {
  detectImageSignature,
  validateImageSignature,
  MAX_ROOM_IMAGE_FILES,
  MAX_ROOM_IMAGE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from '../utils/image-signature.util.js';

describe('Image Signature Utility', () => {
  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const validPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const validWebp = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP'),
    Buffer.from('VP8 '),
  ]);

  it('exposes expected limits and MIME types', () => {
    expect(MAX_ROOM_IMAGE_FILES).toBe(10);
    expect(MAX_ROOM_IMAGE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(ALLOWED_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  describe('detectImageSignature', () => {
    it('detects JPEG format correctly', () => {
      expect(detectImageSignature(validJpeg)).toBe('image/jpeg');
    });

    it('detects PNG format correctly', () => {
      expect(detectImageSignature(validPng)).toBe('image/png');
    });

    it('detects WebP format correctly', () => {
      expect(detectImageSignature(validWebp)).toBe('image/webp');
    });

    it('returns null for empty or truncated buffer', () => {
      expect(detectImageSignature(Buffer.alloc(0))).toBeNull();
      expect(detectImageSignature(Buffer.from([0xff, 0xd8]))).toBeNull();
      expect(detectImageSignature(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
      expect(detectImageSignature(Buffer.from('RIFF1234'))).toBeNull();
    });

    it('returns null for unsupported media formats', () => {
      const gif = Buffer.from('GIF89a\x01\x00\x01\x00');
      expect(detectImageSignature(gif)).toBeNull();

      const pdf = Buffer.from('%PDF-1.4\n%...');
      expect(detectImageSignature(pdf)).toBeNull();

      const text = Buffer.from('Hello world this is not an image');
      expect(detectImageSignature(text)).toBeNull();

      const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
      expect(detectImageSignature(exe)).toBeNull();
    });

    it('returns null for null or non-buffer inputs', () => {
      expect(detectImageSignature(null as any)).toBeNull();
      expect(detectImageSignature(undefined as any)).toBeNull();
      expect(detectImageSignature('not-a-buffer' as any)).toBeNull();
    });
  });

  describe('validateImageSignature', () => {
    it('returns true when detected signature matches declared mime type', () => {
      expect(validateImageSignature(validJpeg, 'image/jpeg')).toBe(true);
      expect(validateImageSignature(validJpeg, 'IMAGE/JPEG')).toBe(true);
      expect(validateImageSignature(validJpeg, 'image/jpg')).toBe(true);
      expect(validateImageSignature(validPng, 'image/png')).toBe(true);
      expect(validateImageSignature(validWebp, 'image/webp')).toBe(true);
    });

    it('returns true when valid buffer is passed without declared mime type', () => {
      expect(validateImageSignature(validJpeg)).toBe(true);
      expect(validateImageSignature(validPng)).toBe(true);
      expect(validateImageSignature(validWebp)).toBe(true);
    });

    it('returns false when declared mime type does not match actual signature', () => {
      expect(validateImageSignature(validJpeg, 'image/png')).toBe(false);
      expect(validateImageSignature(validPng, 'image/jpeg')).toBe(false);
      expect(validateImageSignature(validWebp, 'image/png')).toBe(false);
    });

    it('returns false for non-image or invalid buffers even if declared mime is image/*', () => {
      const text = Buffer.from('Plain text file');
      expect(validateImageSignature(text, 'image/jpeg')).toBe(false);
      expect(validateImageSignature(text, 'image/png')).toBe(false);

      const empty = Buffer.alloc(0);
      expect(validateImageSignature(empty, 'image/jpeg')).toBe(false);
    });
  });
});
