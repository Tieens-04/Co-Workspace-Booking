import prisma from '../utils/prisma.util.js';

export class PasswordResetRepository {
  /** Replaces any outstanding token for the user so only the newest emailed link works. */
  async replaceToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
      prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } }),
    ]);
  }

  async deleteByHash(tokenHash: string): Promise<void> {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
  }

  /**
   * Atomically consumes a valid token and stores the new password hash. The conditional
   * update (unused and unexpired) lets exactly one concurrent request win; others get null.
   */
  async consumeAndSetPassword(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<string | null> {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return null;

      const token = await tx.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash },
        select: { userId: true },
      });
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      // Any other outstanding link for this account stops working too.
      await tx.passwordResetToken.deleteMany({
        where: { userId: token.userId, usedAt: null },
      });
      return token.userId;
    });
  }
}

export const passwordResetRepository = new PasswordResetRepository();
