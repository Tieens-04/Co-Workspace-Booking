import { describe, expect, it, vi } from 'vitest';
import {
  EmailVerificationService,
  hashVerificationToken,
} from '../services/email-verification.service.js';
import { AuthService } from '../services/auth.service.js';

describe('Email verification unit tests (CWB-87)', () => {
  it('hashVerificationToken produces 64-char hex sha256', () => {
    const hash = hashVerificationToken('test-token-123');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashVerificationToken('test-token-123')).toBe(hash);
  });

  describe('verifyEmail', () => {
    it('rejects invalid or missing token format with INVALID_VERIFICATION_TOKEN (400)', async () => {
      const service = new EmailVerificationService({} as any, {} as any);
      await expect(service.verifyEmail('')).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_VERIFICATION_TOKEN',
          statusCode: 400,
        }),
      );
      await expect(service.verifyEmail('short')).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_VERIFICATION_TOKEN',
          statusCode: 400,
        }),
      );
    });

    it('rejects unknown, expired or already consumed token with INVALID_VERIFICATION_TOKEN (400)', async () => {
      const mockRepo = {
        consumeToken: vi.fn().mockResolvedValue(null),
      };
      const service = new EmailVerificationService(mockRepo as any, {} as any);
      // Valid base64url 32 bytes = 43 chars
      const validToken = 'abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
      const evaluationTime = new Date('2026-11-10T12:00:00.000Z');
      await expect(service.verifyEmail(validToken, evaluationTime)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_VERIFICATION_TOKEN',
          statusCode: 400,
        }),
      );
      expect(mockRepo.consumeToken).toHaveBeenCalledWith(
        hashVerificationToken(validToken),
        evaluationTime,
      );
    });

    it('succeeds when repo returns userId and does not leak token or secrets', async () => {
      const mockRepo = {
        consumeToken: vi.fn().mockResolvedValue({ userId: 'user-123' }),
      };
      const service = new EmailVerificationService(mockRepo as any, {} as any);
      const validToken = 'abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
      const result = await service.verifyEmail(validToken);
      expect(result).toEqual({ userId: 'user-123' });
    });
  });

  describe('registration transaction rollback on enqueue failure (S1/T2)', () => {
    it('propagates enqueue failure and does not kick worker when enqueueAccountEmail fails', async () => {
      const mockUserRepo = {
        findByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'user-pending',
          email: 'pending@example.com',
          fullName: 'Pending Customer',
          phoneNumber: null,
          role: 'CUSTOMER',
          emailVerifiedAt: null,
        }),
      };
      const mockOutboxRepo = {
        enqueueAccountEmail: vi.fn().mockRejectedValue(new Error('Outbox enqueue failed')),
      };
      const mockOutboxService = {
        kick: vi.fn(),
      };
      const mockDb = {
        $transaction: vi.fn().mockImplementation(async (callback: any) => {
          return callback({});
        }),
      };

      const authService = new AuthService(
        mockUserRepo as any,
        mockOutboxService as any,
        mockOutboxRepo as any,
        mockDb as any,
      );

      await expect(
        authService.register({
          email: 'pending@example.com',
          password: 'Password123!',
          fullName: 'Pending Customer',
        }),
      ).rejects.toThrow('Outbox enqueue failed');

      expect(mockOutboxRepo.enqueueAccountEmail).toHaveBeenCalledTimes(1);
      expect(mockOutboxService.kick).not.toHaveBeenCalled();
    });
  });

  describe('resendVerification', () => {
    it('no-ops without kicking outbox when user is already verified, deleted, or locked', async () => {
      const mockRepo = {
        enqueueResendIfEligible: vi.fn().mockResolvedValue(false),
      };
      const mockOutboxService = {
        kick: vi.fn(),
      };
      const service = new EmailVerificationService(mockRepo as any, mockOutboxService as any);

      await service.resendVerification('user-ineligible');
      expect(mockRepo.enqueueResendIfEligible).toHaveBeenCalledWith('user-ineligible');
      expect(mockOutboxService.kick).not.toHaveBeenCalled();
    });

    it('kicks outbox worker when transaction locks unverified active unlocked user and enqueues email', async () => {
      const mockRepo = {
        enqueueResendIfEligible: vi.fn().mockResolvedValue(true),
      };
      const mockOutboxService = {
        kick: vi.fn(),
      };
      const service = new EmailVerificationService(mockRepo as any, mockOutboxService as any);

      await service.resendVerification('user-123');
      expect(mockRepo.enqueueResendIfEligible).toHaveBeenCalledWith('user-123');
      expect(mockOutboxService.kick).toHaveBeenCalledTimes(1);
    });
  });
});
