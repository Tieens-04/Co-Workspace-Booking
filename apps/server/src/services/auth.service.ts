import { Role, Prisma, PrismaClient } from '@prisma/client';
import { ENV } from '../config/env.config.js';
import prisma from '../utils/prisma.util.js';
import { AppError } from '../utils/error.util.js';
import { hashPassword, comparePassword, compareDummyPassword } from '../utils/password.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { UserRepository, userRepository } from '../repositories/user.repository.js';
import { enqueueAccountEmail } from '../repositories/email-outbox.repository.js';
import { emailOutboxService, EmailOutboxService } from './email-outbox.service.js';
import { RegisterInput, LoginInput } from '../validators/auth.validator.js';

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: Role;
  emailVerifiedAt: Date | null;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: SafeUser;
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository = userRepository,
    private readonly outboxService: EmailOutboxService = emailOutboxService,
    private readonly outboxRepo: { enqueueAccountEmail: typeof enqueueAccountEmail } = {
      enqueueAccountEmail,
    },
    private readonly db: PrismaClient = prisma,
  ) {}

  async register(dto: RegisterInput): Promise<SafeUser> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.userRepo.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new AppError('EMAIL_ALREADY_EXISTS', 'Email đã được sử dụng', 409);
    }

    const passwordHash = await hashPassword(dto.password);

    try {
      const createdUser = await this.db.$transaction(async (tx) => {
        const user = await this.userRepo.create(
          {
            email: normalizedEmail,
            passwordHash,
            fullName: dto.fullName.trim(),
            phoneNumber: dto.phoneNumber?.trim() || null,
            role: Role.CUSTOMER,
          },
          tx,
        );
        await this.outboxRepo.enqueueAccountEmail(tx, 'EMAIL_VERIFICATION', user.id);
        return user;
      });

      this.outboxService.kick();

      return {
        id: createdUser.id,
        email: createdUser.email,
        fullName: createdUser.fullName,
        phoneNumber: createdUser.phoneNumber,
        role: createdUser.role,
        emailVerifiedAt: createdUser.emailVerifiedAt,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target === 'users_email_key' ||
          (Array.isArray(err.meta?.target) &&
            err.meta.target.length === 1 &&
            err.meta.target[0] === 'email'))
      ) {
        throw new AppError('EMAIL_ALREADY_EXISTS', 'Email đã được sử dụng', 409);
      }
      throw err;
    }
  }

  async login(dto: LoginInput): Promise<LoginResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.userRepo.findByEmail(normalizedEmail);
    // CWB-88: an anonymized account behaves exactly like an unknown email.
    if (!user || user.deletedAt) {
      await compareDummyPassword(dto.password);
      throw new AppError('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác', 401);
    }

    const isMatch = await comparePassword(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new AppError('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác', 401);
    }

    // CWB-79: only revealed after the correct password, so the lock state does not leak.
    if (user.lockedAt) {
      throw new AppError(
        'ACCOUNT_LOCKED',
        'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quầy lễ tân để được hỗ trợ.',
        403,
      );
    }

    const accessToken = generateToken({
      sub: user.id,
      role: user.role,
      tv: user.tokenVersion,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ENV.JWT_EXPIRES_IN_SECONDS,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    };
  }
}

export const authService = new AuthService();
