import { AppError } from '../utils/error.util.js';
import {
  emailVerificationRepository,
  EmailVerificationRepository,
  hashVerificationToken,
  VERIFICATION_TOKEN_TTL_MINUTES,
} from '../repositories/email-verification.repository.js';
import { emailOutboxService, EmailOutboxService } from './email-outbox.service.js';

export { hashVerificationToken, VERIFICATION_TOKEN_TTL_MINUTES };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class EmailVerificationService {
  constructor(
    private readonly repo: EmailVerificationRepository = emailVerificationRepository,
    private readonly outboxService: EmailOutboxService = emailOutboxService,
  ) {}

  async verifyEmail(token: string, now = new Date()): Promise<{ userId: string }> {
    if (!token || !TOKEN_PATTERN.test(token)) {
      throw new AppError(
        'INVALID_VERIFICATION_TOKEN',
        'Liên kết xác thực không hợp lệ hoặc đã hết hạn',
        400,
      );
    }

    const result = await this.repo.consumeToken(hashVerificationToken(token), now);
    if (!result) {
      throw new AppError(
        'INVALID_VERIFICATION_TOKEN',
        'Liên kết xác thực không hợp lệ hoặc đã hết hạn',
        400,
      );
    }

    return result;
  }

  async resendVerification(userId: string): Promise<void> {
    const enqueued = await this.repo.enqueueResendIfEligible(userId);
    if (enqueued) {
      this.outboxService.kick();
    }
  }
}

export const emailVerificationService = new EmailVerificationService();
