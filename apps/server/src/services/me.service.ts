import { User } from '@prisma/client';
import { ENV } from '../config/env.config.js';
import { AppError } from '../utils/error.util.js';
import { comparePassword, hashPassword } from '../utils/password.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { UserRepository, userRepository } from '../repositories/user.repository.js';
import type { LoginResult, SafeUser } from './auth.service.js';
import type { ChangePasswordInput, UpdateMeInput } from '../validators/me.validator.js';

const toSafeUser = (user: User): SafeUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  phoneNumber: user.phoneNumber,
  role: user.role,
  emailVerifiedAt: user.emailVerifiedAt,
});

// A valid token whose account no longer exists is treated as an invalid session.
const sessionGone = () =>
  new AppError('UNAUTHORIZED', 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại', 401);

/**
 * Self-service account operations. The user id always comes from the verified JWT (`req.user.sub`),
 * never from the request, so one account can never read or change another (no IDOR).
 */
export class MeService {
  constructor(private readonly userRepo: UserRepository = userRepository) {}

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw sessionGone();
    return toSafeUser(user);
  }

  async updateProfile(userId: string, input: UpdateMeInput): Promise<SafeUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw sessionGone();
    const updated = await this.userRepo.updateProfile(userId, {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
    });
    return toSafeUser(updated);
  }

  /**
   * Verifies the current password, stores a new bcrypt hash and bumps the token version (CWB-77):
   * every token issued earlier (other devices) gets 401, this session continues with the fresh
   * token returned here.
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<LoginResult> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw sessionGone();

    const matches = await comparePassword(input.currentPassword, user.passwordHash);
    if (!matches) {
      // 400 (not 401): a wrong current password must not end the caller's session.
      throw new AppError('INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không chính xác', 400);
    }

    const updated = await this.userRepo.updatePasswordHashAndRevokeSessions(
      userId,
      await hashPassword(input.newPassword),
    );
    return {
      accessToken: generateToken({ sub: updated.id, role: updated.role, tv: updated.tokenVersion }),
      tokenType: 'Bearer',
      expiresIn: ENV.JWT_EXPIRES_IN_SECONDS,
      user: toSafeUser(updated),
    };
  }

  /** "Log out everywhere": revokes every token of the account, including the caller's (CWB-77). */
  async logoutAll(userId: string): Promise<void> {
    const revoked = await this.userRepo.revokeSessions(userId);
    if (!revoked) throw sessionGone();
  }
}

export const meService = new MeService();
