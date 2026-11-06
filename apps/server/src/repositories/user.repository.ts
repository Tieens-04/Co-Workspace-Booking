import { User, Role } from '@prisma/client';
import prisma from '../utils/prisma.util.js';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  fullName: string;
  phoneNumber?: string | null;
  role?: Role;
}

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async updateProfile(
    id: string,
    data: { fullName?: string; phoneNumber?: string | null },
  ): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  }

  /** Token version and lock state for the per-request session check (CWB-77, CWB-79). */
  async findSessionState(
    id: string,
  ): Promise<{ tokenVersion: number; lockedAt: Date | null } | null> {
    return prisma.user.findUnique({
      where: { id },
      select: { tokenVersion: true, lockedAt: true },
    });
  }

  /** Stores a new password hash and revokes every token issued before it in one statement. */
  async updatePasswordHashAndRevokeSessions(id: string, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
  }

  /** Revokes every token issued so far; returns false when the account no longer exists. */
  async revokeSessions(id: string): Promise<boolean> {
    const result = await prisma.user.updateMany({
      where: { id },
      data: { tokenVersion: { increment: 1 } },
    });
    return result.count === 1;
  }

  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        phoneNumber: data.phoneNumber ?? null,
        role: data.role ?? Role.CUSTOMER,
      },
    });
  }
}

export const userRepository = new UserRepository();
