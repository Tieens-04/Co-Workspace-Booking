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
