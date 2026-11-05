import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import prisma from '../../utils/prisma.util.js';
import { generateToken } from '../../utils/jwt.util.js';

/**
 * Integration tests' signed-in actors. Since CWB-77 the auth middleware only accepts a token whose
 * subject is an existing account at the token's version, so every token needs a real `users` row.
 * `token()` keeps describe-level constants synchronous; `persist()` (a beforeAll) inserts the rows
 * and `cleanup()` (an afterAll declared first, so it runs after the suite's own cleanup) removes
 * them. Rows use an unusable password hash and a per-account email.
 */
export class TestAccounts {
  private readonly pending = new Map<string, Role>();
  private readonly created: string[] = [];

  token(role: Role, id: string = randomUUID()): string {
    this.pending.set(id, role);
    return generateToken({ sub: id, role });
  }

  async create(role: Role, id: string = randomUUID()): Promise<string> {
    const token = this.token(role, id);
    await this.persist();
    return token;
  }

  async persist(): Promise<void> {
    const rows = [...this.pending].map(([id, role]) => ({
      id,
      role,
      email: `test_account_${id}@example.com`,
      passwordHash: '!integration-test-account',
      fullName: `Integration ${role}`,
    }));
    this.pending.clear();
    if (rows.length === 0) return;
    await prisma.user.createMany({ data: rows });
    this.created.push(...rows.map((row) => row.id));
  }

  async cleanup(): Promise<void> {
    if (this.created.length === 0) return;
    await prisma.user.deleteMany({ where: { id: { in: this.created } } });
  }
}
