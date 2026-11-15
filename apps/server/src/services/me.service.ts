import { Role, User } from '@prisma/client';
import { ENV } from '../config/env.config.js';
import { AppError } from '../utils/error.util.js';
import { comparePassword, hashPassword } from '../utils/password.util.js';
import { generateToken } from '../utils/jwt.util.js';
import {
  accountDeletedError,
  accountLockedError,
  UserRepository,
  userRepository,
} from '../repositories/user.repository.js';
import type { LoginResult, SafeUser } from './auth.service.js';
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  UpdateMeInput,
} from '../validators/me.validator.js';

const toSafeUser = (user: User): SafeUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  phoneNumber: user.phoneNumber,
  role: user.role,
  emailVerifiedAt: user.emailVerifiedAt,
});

/**
 * Self-service account operations. The user id always comes from the verified JWT (`req.user.sub`),
 * never from the request, so one account can never read or change another (no IDOR).
 */
export class MeService {
  constructor(private readonly userRepo: UserRepository = userRepository) {}

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.deletedAt || user.lockedAt) throw accountDeletedError();
    return toSafeUser(user);
  }

  async updateProfile(userId: string, input: UpdateMeInput): Promise<SafeUser> {
    const result = await this.userRepo.updateProfile(userId, {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
    });
    if (result.status === 'NOT_FOUND') throw accountDeletedError();
    if (result.status === 'LOCKED') throw accountLockedError();
    return toSafeUser(result.user);
  }

  /**
   * Verifies the current password, stores a new bcrypt hash and bumps the token version (CWB-77):
   * every token issued earlier (other devices) gets 401, this session continues with the fresh
   * token returned here.
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<LoginResult> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.deletedAt) throw accountDeletedError();

    const matches = await comparePassword(input.currentPassword, user.passwordHash);
    if (!matches) {
      // 400 (not 401): a wrong current password must not end the caller's session.
      throw new AppError('INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không chính xác', 400);
    }
    if (user.lockedAt) throw accountLockedError();

    const result = await this.userRepo.updatePasswordHashAndRevokeSessions(
      userId,
      await hashPassword(input.newPassword),
    );
    if (result.status === 'NOT_FOUND') throw accountDeletedError();
    if (result.status === 'LOCKED') throw accountLockedError();

    return {
      accessToken: generateToken({
        sub: result.user.id,
        role: result.user.role,
        tv: result.user.tokenVersion,
      }),
      tokenType: 'Bearer',
      expiresIn: ENV.JWT_EXPIRES_IN_SECONDS,
      user: toSafeUser(result.user),
    };
  }

  /** "Log out everywhere": revokes every token of the account, including the caller's (CWB-77). */
  async logoutAll(userId: string): Promise<void> {
    const revoked = await this.userRepo.revokeSessions(userId);
    if (!revoked) throw accountDeletedError();
  }

  /**
   * CWB-88 (Decree 13/2023 erasure request): re-confirms the password, then anonymizes the
   * account. Blocked with 409 while a CONFIRMED booking is upcoming or running. Admin accounts are
   * managed separately and cannot be deleted here.
   */
  async deleteAccount(userId: string, input: DeleteAccountInput, now = new Date()): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.deletedAt) throw accountDeletedError();
    if (user.role !== Role.CUSTOMER) {
      throw new AppError(
        'ACCOUNT_DELETION_FORBIDDEN',
        'Tài khoản quản trị không thể tự xóa. Vui lòng liên hệ quản trị hệ thống.',
        403,
      );
    }

    const matches = await comparePassword(input.currentPassword, user.passwordHash);
    if (!matches) {
      throw new AppError('INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không chính xác', 400);
    }
    if (user.lockedAt) throw accountLockedError();

    const result = await this.userRepo.anonymizeAccount(userId, now);
    if (result.status === 'NOT_FOUND') throw accountDeletedError();
    if (result.status === 'LOCKED') throw accountLockedError();
    if (result.status === 'HAS_ACTIVE_BOOKINGS') {
      throw new AppError(
        'ACCOUNT_HAS_ACTIVE_BOOKINGS',
        'Bạn còn lịch đặt phòng chưa kết thúc. Vui lòng hủy các lịch này trước khi xóa tài khoản.',
        409,
        { bookings: result.bookings },
      );
    }
  }
}

export const meService = new MeService();
