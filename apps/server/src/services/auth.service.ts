import { Role, Prisma } from '@prisma/client';
import { ENV } from '../config/env.config.js';
import { AppError } from '../utils/error.util.js';
import { hashPassword, comparePassword, compareDummyPassword } from '../utils/password.util.js';
import { generateToken } from '../utils/jwt.util.js';
import { UserRepository, userRepository } from '../repositories/user.repository.js';
import { RegisterInput, LoginInput } from '../validators/auth.validator.js';

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: Role;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: SafeUser;
}

export class AuthService {
  constructor(private readonly userRepo: UserRepository = userRepository) {}

  async register(dto: RegisterInput): Promise<SafeUser> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.userRepo.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new AppError('EMAIL_ALREADY_EXISTS', 'Email đã được sử dụng', 409);
    }

    const passwordHash = await hashPassword(dto.password);

    try {
      const createdUser = await this.userRepo.create({
        email: normalizedEmail,
        passwordHash,
        fullName: dto.fullName.trim(),
        phoneNumber: dto.phoneNumber?.trim() || null,
        role: Role.CUSTOMER,
      });

      return {
        id: createdUser.id,
        email: createdUser.email,
        fullName: createdUser.fullName,
        phoneNumber: createdUser.phoneNumber,
        role: createdUser.role,
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
    if (!user) {
      await compareDummyPassword(dto.password);
      throw new AppError('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác', 401);
    }

    const isMatch = await comparePassword(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new AppError('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác', 401);
    }

    const accessToken = generateToken({
      sub: user.id,
      role: user.role,
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
      },
    };
  }
}

export const authService = new AuthService();
