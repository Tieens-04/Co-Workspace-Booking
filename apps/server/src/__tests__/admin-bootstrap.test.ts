import { describe, it, expect, vi } from 'vitest';
import { Prisma, Role } from '@prisma/client';
import {
  AdminBootstrapError,
  AdminBootstrapUserStore,
  bootstrapAdmin,
} from '../services/admin-bootstrap.service.js';

const PASSWORD = 'Str0ng-Bootstrap-Pass!';
const env = {
  ADMIN_BOOTSTRAP_EMAIL: '  Ops.Admin@Company.Example ',
  ADMIN_BOOTSTRAP_PASSWORD: PASSWORD,
  ADMIN_BOOTSTRAP_FULL_NAME: 'Operations Admin',
};

const makeStore = (existing: { role: Role } | null = null) => ({
  findUnique: vi.fn<AdminBootstrapUserStore['findUnique']>().mockResolvedValue(existing),
  create: vi.fn<AdminBootstrapUserStore['create']>().mockResolvedValue({}),
});
const fakeHash = vi.fn(async (password: string) => `hashed(${password.length})`);

describe('Admin bootstrap (CWB-59)', () => {
  it('creates an ADMIN with a hashed password and normalized email', async () => {
    const users = makeStore();

    const result = await bootstrapAdmin(env, users, fakeHash);

    expect(result).toEqual({ status: 'created', email: 'ops.admin@company.example' });
    expect(fakeHash).toHaveBeenCalledWith(PASSWORD);
    expect(users.create).toHaveBeenCalledWith({
      data: {
        email: 'ops.admin@company.example',
        fullName: 'Operations Admin',
        phoneNumber: null,
        passwordHash: `hashed(${PASSWORD.length})`,
        role: Role.ADMIN,
        emailVerifiedAt: expect.any(Date),
      },
    });
    expect(JSON.stringify(users.create.mock.calls)).not.toContain(PASSWORD);
  });

  it('is a no-op for an existing ADMIN and never resets its password', async () => {
    const users = makeStore({ role: Role.ADMIN });
    const hash = vi.fn();

    const result = await bootstrapAdmin(env, users, hash);

    expect(result.status).toBe('already-admin');
    expect(users.create).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it('refuses to elevate an existing CUSTOMER account', async () => {
    const users = makeStore({ role: Role.CUSTOMER });

    await expect(bootstrapAdmin(env, users, fakeHash)).rejects.toThrow(/refusing to elevate/);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('reports already-admin when a concurrent bootstrap wins the unique race', async () => {
    const users = makeStore();
    users.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ role: Role.ADMIN });
    users.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(bootstrapAdmin(env, users, fakeHash)).resolves.toMatchObject({
      status: 'already-admin',
    });
  });

  it.each([
    [{ ...env, ADMIN_BOOTSTRAP_PASSWORD: 'short' }, 'password'],
    [{ ...env, ADMIN_BOOTSTRAP_EMAIL: 'not-an-email' }, 'email'],
    [{ ...env, ADMIN_BOOTSTRAP_FULL_NAME: '  ' }, 'fullName'],
    [{ ADMIN_BOOTSTRAP_EMAIL: env.ADMIN_BOOTSTRAP_EMAIL }, 'password'],
  ])('rejects invalid input without echoing submitted values (%#)', async (input, field) => {
    const users = makeStore();

    const error = await bootstrapAdmin(input, users, fakeHash).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AdminBootstrapError);
    expect((error as Error).message).toContain(field);
    expect((error as Error).message).not.toContain('short');
    expect((error as Error).message).not.toContain(PASSWORD);
    expect(users.findUnique).not.toHaveBeenCalled();
    expect(users.create).not.toHaveBeenCalled();
  });
});
