import { Prisma, Role } from '@prisma/client';
import { registerSchema } from '../validators/auth.validator.js';

/**
 * Production admin bootstrap: creates the first ADMIN from environment input.
 * Never prints or persists the plaintext password and never elevates an existing
 * non-admin account. Re-running for an existing ADMIN is a no-op (no password reset).
 */
export interface AdminBootstrapEnv {
  ADMIN_BOOTSTRAP_EMAIL?: string;
  ADMIN_BOOTSTRAP_PASSWORD?: string;
  ADMIN_BOOTSTRAP_FULL_NAME?: string;
  ADMIN_BOOTSTRAP_PHONE?: string;
}

export type AdminBootstrapResult = { status: 'created' | 'already-admin'; email: string };

export interface AdminBootstrapUserStore {
  findUnique(args: {
    where: { email: string };
    select: { role: true };
  }): Promise<{ role: Role } | null>;
  create(args: {
    data: {
      email: string;
      fullName: string;
      phoneNumber: string | null;
      passwordHash: string;
      role: Role;
    };
  }): Promise<unknown>;
}

export class AdminBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminBootstrapError';
  }
}

/** Validates env input with the registration rules; issues never echo submitted values. */
export function readAdminBootstrapInput(env: AdminBootstrapEnv) {
  const parsed = registerSchema.safeParse({
    email: env.ADMIN_BOOTSTRAP_EMAIL ?? '',
    password: env.ADMIN_BOOTSTRAP_PASSWORD ?? '',
    fullName: env.ADMIN_BOOTSTRAP_FULL_NAME ?? '',
    phoneNumber: env.ADMIN_BOOTSTRAP_PHONE?.trim() ? env.ADMIN_BOOTSTRAP_PHONE : null,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new AdminBootstrapError(`Invalid ADMIN_BOOTSTRAP_* input (${fields.join('; ')})`);
  }
  return parsed.data;
}

export async function bootstrapAdmin(
  env: AdminBootstrapEnv,
  users: AdminBootstrapUserStore,
  hashPassword: (password: string) => Promise<string>,
): Promise<AdminBootstrapResult> {
  const input = readAdminBootstrapInput(env);

  const existing = await users.findUnique({
    where: { email: input.email },
    select: { role: true },
  });
  if (existing) {
    if (existing.role === Role.ADMIN) return { status: 'already-admin', email: input.email };
    throw new AdminBootstrapError(
      'An account with this email exists without the ADMIN role; refusing to elevate it.',
    );
  }

  try {
    await users.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        phoneNumber: input.phoneNumber ?? null,
        passwordHash: await hashPassword(input.password),
        role: Role.ADMIN,
      },
    });
  } catch (err) {
    // A concurrent bootstrap won the race; report the stored role instead of failing blindly.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await users.findUnique({
        where: { email: input.email },
        select: { role: true },
      });
      if (winner?.role === Role.ADMIN) return { status: 'already-admin', email: input.email };
      throw new AdminBootstrapError(
        'An account with this email exists without the ADMIN role; refusing to elevate it.',
      );
    }
    throw err;
  }
  return { status: 'created', email: input.email };
}
