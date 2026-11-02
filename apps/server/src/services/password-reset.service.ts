import { createHash, randomBytes } from 'node:crypto';
import { ENV } from '../config/env.config.js';
import { AppError } from '../utils/error.util.js';
import { hashPassword } from '../utils/password.util.js';
import { trackBackgroundTask } from '../utils/background-tasks.util.js';
import { UserRepository, userRepository } from '../repositories/user.repository.js';
import {
  PasswordResetRepository,
  passwordResetRepository,
} from '../repositories/password-reset.repository.js';
import {
  NotificationService,
  notificationService as defaultNotificationService,
} from './notification.service.js';

export const RESET_TOKEN_TTL_MINUTES = 30;

export const hashResetToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * Self-service password recovery (CWB-64).
 * - requestReset never reveals whether the email exists: it returns immediately and does the
 *   lookup, token creation and email in a tracked background task (constant response time).
 * - Tokens are 256-bit random values; only their SHA-256 hash is stored, valid for 30 minutes
 *   and consumed atomically once. No token is kept when SMTP is unavailable or delivery fails.
 */
export class PasswordResetService {
  constructor(
    private readonly userRepo: UserRepository = userRepository,
    private readonly resetRepo: PasswordResetRepository = passwordResetRepository,
    private readonly notificationService: NotificationService = defaultNotificationService,
  ) {}

  requestReset(email: string): void {
    trackBackgroundTask(this.issueAndSend(email.trim().toLowerCase()));
  }

  /** Exposed for tests; resolves after the (possibly skipped) delivery attempt. */
  async issueAndSend(normalizedEmail: string, now = new Date()): Promise<void> {
    try {
      if (!this.notificationService.canDeliver()) return;
      const user = await this.userRepo.findByEmail(normalizedEmail);
      if (!user) return;

      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      await this.resetRepo.replaceToken(user.id, tokenHash, expiresAt);

      const resetUrl = `${ENV.CLIENT_URL.replace(/\/+$/, '')}/reset-password?token=${token}`;
      const sent = await this.notificationService.sendPasswordReset({
        recipientEmail: user.email,
        customerName: user.fullName,
        resetUrl,
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
        reference: user.id,
      });
      // An undeliverable link must not stay usable.
      if (!sent) await this.resetRepo.deleteByHash(tokenHash);
    } catch {
      console.error('[PasswordReset] request processing failed');
    }
  }

  async resetPassword(token: string, newPassword: string, now = new Date()): Promise<void> {
    const userId = await this.resetRepo.consumeAndSetPassword(
      hashResetToken(token),
      await hashPassword(newPassword),
      now,
    );
    if (!userId) {
      throw new AppError(
        'INVALID_RESET_TOKEN',
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
        400,
      );
    }
  }
}

export const passwordResetService = new PasswordResetService();
