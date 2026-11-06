import { describe, expect, it, vi } from 'vitest';
import type { UserRepository } from '../repositories/user.repository.js';

// The unit setup mocks this module for HTTP tests; exercise the real implementation here.
const { SessionService } = await vi.importActual<typeof import('../services/session.service.js')>(
  '../services/session.service.js',
);

const serviceWith = (stored: number | null, lockedAt: Date | null = null) => {
  const findSessionState = vi.fn(async () =>
    stored === null ? null : { tokenVersion: stored, lockedAt },
  );
  const service = new SessionService({ findSessionState } as unknown as UserRepository);
  return { service, findSessionState };
};

describe('SessionService.isTokenCurrent (CWB-77)', () => {
  it('accepts a token whose version equals the stored version', async () => {
    const { service, findSessionState } = serviceWith(2);
    await expect(service.isTokenCurrent('user-1', 2)).resolves.toBe(true);
    expect(findSessionState).toHaveBeenCalledWith('user-1');
  });

  it.each([
    ['older (revoked) version', 1],
    ['newer (forged) version', 3],
  ])('rejects an %s', async (_label, tv) => {
    const { service } = serviceWith(2);
    await expect(service.isTokenCurrent('user-1', tv)).resolves.toBe(false);
  });

  it('rejects a token for an account that no longer exists', async () => {
    const { service } = serviceWith(null);
    await expect(service.isTokenCurrent('user-1', 0)).resolves.toBe(false);
  });

  it('rejects a current-version token of a locked account (CWB-79)', async () => {
    const { service } = serviceWith(2, new Date('2026-11-06T03:00:00Z'));
    await expect(service.isTokenCurrent('user-1', 2)).resolves.toBe(false);
  });
});
