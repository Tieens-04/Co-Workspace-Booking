import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/error.util.js';
import {
  emailVerificationRepository,
  EmailVerificationRepository,
  hashVerificationToken,
  VERIFICATION_TOKEN_TTL_MINUTES,
} from '../repositories/email-verification.repository.js';
import { userRepository, UserRepository } from '../repositories/user.repository.js';
import { enqueueAccountEmail } from '../repositories/email-outbox.repository.js';
import { emailOutboxService, EmailOutboxService } from './email-outbox.service.js';
import prisma from '../utils/prisma.util.js';

export { hashVerificationToken, VERIFICATION_TOKEN_TTL_MINUTES };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class EmailVerificationService {
  constructor(
    private readonly repo: EmailVerificationRepository = emailVerificationRepository,
    private readonly userRepo: UserRepository = userRepository,
    private readonly outboxService: EmailOutboxService = emailOutboxService,
    private readonly outboxRepo: { enqueueAccountEmail: typeof enqueueAccountEmail } = {
      enqueueAccountEmail,
    },
    private readonly db: PrismaClient = prisma,
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
    const user = await this.userRepo.findById(userId);
    if (!user || user.emailVerifiedAt) {
      // Generic no-op; returns same response so caller cannot infer account state
      return;
    }

    await this.db.$transaction(async (tx) => {
      await this.outboxRepo.enqueueAccountEmail(tx, 'EMAIL_VERIFICATION', userId);
    });

    this.outboxService.kick();
  }
}

export const emailVerificationService = new EmailVerificationService();
