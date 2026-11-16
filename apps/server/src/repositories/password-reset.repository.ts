import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma.util.js';

export class PasswordResetRepository {
  /**
   * Issues a reset token under the user row-lock, removing only already-expired tokens for this
   * user so a transient SMTP failure on a later request cannot break a valid earlier link.
   * Returns false when the user does not exist, was deleted, or is currently locked.
   */
  async replaceToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    now: Date = new Date(),
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<Array<{ deleted_at: Date | null; locked_at: Date | null }>>(
        Prisma.sql`SELECT deleted_at, locked_at FROM users WHERE id = ${userId} FOR UPDATE`,
      );
      if (!user || user.deleted_at || user.locked_at) return false;

      await tx.passwordResetToken.deleteMany({
        where: { userId, expiresAt: { lte: now } },
      });
      await tx.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
      return true;
    });
  }

  async deleteByHash(tokenHash: string): Promise<void> {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
  }

  /**
   * Atomically consumes a valid token and stores the new password hash. Locks the user row first
   * (consistent locking order: users -> password_reset_tokens) and rejects deleted/locked accounts.
   * The conditional update (unused and unexpired) lets exactly one concurrent request win; others get null.
   */
  async consumeAndSetPassword(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<string | null> {
    return prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { userId: true, usedAt: true, expiresAt: true },
      });
      if (!token || token.usedAt !== null || token.expiresAt <= now) {
        return null;
      }

      // Lock user row first (consistent locking order: users -> password_reset_tokens)
      const [user] = await tx.$queryRaw<
        Array<{ id: string; deleted_at: Date | null; locked_at: Date | null }>
      >(
        Prisma.sql`SELECT id, deleted_at, locked_at FROM users WHERE id = ${token.userId} FOR UPDATE`,
      );
      if (!user || user.deleted_at || user.locked_at) return null;

      const claimed = await tx.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return null;

      // Bumping the token version revokes every JWT issued before the reset (CWB-77).
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      // Any other outstanding link for this account stops working too.
      await tx.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      return user.id;
    });
  }
}

export const passwordResetRepository = new PasswordResetRepository();
