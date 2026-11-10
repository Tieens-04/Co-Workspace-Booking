import { randomBytes, createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma.util.js';

export const VERIFICATION_TOKEN_TTL_MINUTES = 30;

export const hashVerificationToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export type IssueVerificationTokenResult =
  | {
      status: 'ISSUED';
      token: string;
      tokenHash: string;
      recipientEmail: string;
      customerName: string;
      userId: string;
    }
  | { status: 'USER_NOT_FOUND' }
  | { status: 'ALREADY_VERIFIED' };

export class EmailVerificationRepository {
  /**
   * Generates a fresh verification token under user row-lock, cleans up expired tokens for this user,
   * and persists its hash. The unexpired token hashes from earlier attempts are preserved so an ambiguous
   * delivery outcome does not silently invalidate an emailed link.
   */
  async issueToken(userId: string, now = new Date()): Promise<IssueVerificationTokenResult> {
    return prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<
        Array<{ id: string; email: string; full_name: string; email_verified_at: Date | null }>
      >(
        Prisma.sql`SELECT id, email, full_name, email_verified_at FROM users WHERE id = ${userId} FOR UPDATE`,
      );

      if (!user) return { status: 'USER_NOT_FOUND' };
      if (user.email_verified_at) return { status: 'ALREADY_VERIFIED' };

      // Bounded cleanup: remove already-expired tokens for this user
      await tx.emailVerificationToken.deleteMany({
        where: { userId, expiresAt: { lte: now } },
      });

      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashVerificationToken(token);
      const expiresAt = new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);

      await tx.emailVerificationToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
        },
      });

      return {
        status: 'ISSUED',
        token,
        tokenHash,
        recipientEmail: user.email,
        customerName: user.full_name,
        userId: user.id,
      };
    });
  }

  /**
   * Atomically claims a valid, unexpired token, marks the user verified, and deletes all other
   * outstanding verification tokens for this user.
   */
  async consumeToken(tokenHash: string, now = new Date()): Promise<{ userId: string } | null> {
    return prisma.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        select: { userId: true, usedAt: true, expiresAt: true },
      });

      if (!token || token.usedAt !== null || token.expiresAt <= now) {
        return null;
      }

      // Lock user row first (consistent locking order: user -> token)
      const [user] = await tx.$queryRaw<Array<{ id: string; email_verified_at: Date | null }>>(
        Prisma.sql`SELECT id, email_verified_at FROM users WHERE id = ${token.userId} FOR UPDATE`,
      );

      if (!user) return null;

      // Conditional claim
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });

      if (claimed.count !== 1) return null;

      if (!user.email_verified_at) {
        await tx.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: now },
        });
      }

      // Invalidate all other outstanding unused verification tokens for this account
      await tx.emailVerificationToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });

      return { userId: user.id };
    });
  }
}

export const emailVerificationRepository = new EmailVerificationRepository();
