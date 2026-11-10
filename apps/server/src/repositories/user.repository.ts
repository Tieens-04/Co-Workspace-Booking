import { BookingStatus, User, Role, Prisma } from '@prisma/client';
import prisma from '../utils/prisma.util.js';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  fullName: string;
  phoneNumber?: string | null;
  role?: Role;
}

/** CONFIRMED booking that must be cancelled (or finish) before the account can be deleted. */
export interface BlockingBookingDto {
  id: string;
  bookingCode: string;
  roomName: string;
  startTime: Date;
  endTime: Date;
}

export type AnonymizeAccountResult =
  | { status: 'ANONYMIZED' }
  | { status: 'NOT_FOUND' }
  | { status: 'HAS_ACTIVE_BOOKINGS'; bookings: BlockingBookingDto[] };

/** Non-identifying, unique replacement email (RFC 2606 `.invalid` never routes mail). */
export const anonymizedEmail = (userId: string) => `deleted-${userId}@deleted.invalid`;
export const ANONYMIZED_FULL_NAME = 'Tài khoản đã xóa';
/** Not a bcrypt hash, so no password can ever match it. */
export const ANONYMIZED_PASSWORD_HASH = '!deleted';

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
  ): Promise<{ tokenVersion: number; lockedAt: Date | null; deletedAt: Date | null } | null> {
    return prisma.user.findUnique({
      where: { id },
      select: { tokenVersion: true, lockedAt: true, deletedAt: true },
    });
  }

  /**
   * CWB-88: anonymizes a customer account in one transaction. The user row is locked first
   * (booking creation locks the same row first too), so a booking racing the deletion either
   * commits before it and blocks it, or waits and is rejected because the account is deleted.
   * Bookings, refunds and audit events keep pointing at the row; only personal data is removed.
   */
  async anonymizeAccount(id: string, now: Date): Promise<AnonymizeAccountResult> {
    return prisma.$transaction(async (tx) => {
      const [account] = await tx.$queryRaw<Array<{ deleted_at: Date | null }>>(
        Prisma.sql`SELECT deleted_at FROM users WHERE id = ${id} FOR UPDATE`,
      );
      if (!account || account.deleted_at) return { status: 'NOT_FOUND' };

      // Upcoming or still running: the customer must cancel them first (or wait for them to end).
      const active = await tx.booking.findMany({
        where: { userId: id, status: BookingStatus.CONFIRMED, endTime: { gt: now } },
        select: {
          id: true,
          bookingCode: true,
          startTime: true,
          endTime: true,
          room: { select: { name: true } },
        },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      });
      if (active.length > 0) {
        return {
          status: 'HAS_ACTIVE_BOOKINGS',
          bookings: active.map((booking) => ({
            id: booking.id,
            bookingCode: booking.bookingCode,
            roomName: booking.room.name,
            startTime: booking.startTime,
            endTime: booking.endTime,
          })),
        };
      }

      await tx.user.update({
        where: { id },
        data: {
          email: anonymizedEmail(id),
          fullName: ANONYMIZED_FULL_NAME,
          phoneNumber: null,
          passwordHash: ANONYMIZED_PASSWORD_HASH,
          emailVerifiedAt: null,
          deletedAt: now,
          // Revokes every JWT issued so far (CWB-77).
          tokenVersion: { increment: 1 },
        },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: id } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: id } });
      // Nothing queued for this person may still go out; delivered history is kept.
      await tx.emailOutbox.updateMany({
        where: { status: 'QUEUED', OR: [{ userId: id }, { booking: { userId: id } }] },
        data: { status: 'SKIPPED', lastError: 'ACCOUNT_DELETED' },
      });
      return { status: 'ANONYMIZED' };
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

  async create(data: CreateUserData, tx?: Prisma.TransactionClient): Promise<User> {
    const client = tx ?? prisma;
    return client.user.create({
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
