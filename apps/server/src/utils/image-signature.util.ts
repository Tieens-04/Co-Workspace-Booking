export const MAX_ROOM_IMAGE_FILES = 10;
export const MAX_ROOM_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function detectImageSignature(buffer: Buffer): AllowedMimeType | null {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return null;
  }

  // JPEG: starts with FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF (4 bytes) + Size (4 bytes) + WEBP (4 bytes)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return 'image/webp';
  }

  return null;
}

export function validateImageSignature(buffer: Buffer, declaredMimeType?: string): boolean {
  const detected = detectImageSignature(buffer);
  if (!detected) {
    return false;
  }

  if (declaredMimeType) {
    const normalized = declaredMimeType.toLowerCase().trim();
    if (normalized === 'image/jpg' && detected === 'image/jpeg') {
      return true;
    }
    return normalized === detected;
  }

  return true;
}
