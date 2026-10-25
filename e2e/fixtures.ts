import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { PrismaClient, Prisma, type User, type Room } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { testDatabaseUrl } from './env.js';

export const PASSWORD = 'BrowserTest49!';
export const HOUR = 3_600_000;
export const HALF_HOUR = HOUR / 2;

/** Wall-clock input values are always Vietnam time, independently of the runner timezone. */
export function localInput(at: Date): string {
  return new Date(at.getTime() + 7 * HOUR).toISOString().slice(0, 16);
}

export function tomorrowAt(hour = 10): Date {
  const tomorrow = new Date(Date.now() + 7 * HOUR + 24 * HOUR);
  return new Date(
    `${tomorrow.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00+07:00`,
  );
}

export class Scenario {
  readonly prefix = `e2e-${randomUUID()}`;
  readonly db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
  readonly users: User[] = [];
  readonly rooms: Room[] = [];
  readonly registeredEmails: string[] = [];
  customer!: User;
  otherCustomer!: User;
  admin!: User;
  room!: Room;

  async initialize() {
    this.customer = await this.user('CUSTOMER');
    this.otherCustomer = await this.user('CUSTOMER');
    this.admin = await this.user('ADMIN');
    this.room = await this.createRoom();
  }

  async user(role: 'CUSTOMER' | 'ADMIN') {
    const user = await this.db.user.create({
      data: {
        email: `${this.prefix}-${this.users.length}@example.com`,
        fullName: `Browser ${role} ${this.users.length}`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role,
      },
    });
    this.users.push(user);
    return user;
  }

  async createRoom() {
    const room = await this.db.room.create({
      data: {
        name: `${this.prefix}-${this.rooms.length}`,
        capacity: 6,
        pricePerHour: new Prisma.Decimal('100000.00'),
        statusHistory: {
          create: { status: 'AVAILABLE', effectiveAt: new Date(Date.now() - 48 * HOUR) },
        },
      },
    });
    this.rooms.push(room);
    return room;
  }

  async booking(overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
    const start = tomorrowAt();
    return this.db.booking.create({
      data: {
        id: randomUUID(),
        bookingCode: `CS-${localInput(start).slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 4).toUpperCase()}`,
        userId: this.customer.id,
        roomId: this.room.id,
        startTime: start,
        endTime: new Date(start.getTime() + 2 * HOUR),
        totalAmount: new Prisma.Decimal('200000.00'),
        ...overrides,
      },
    });
  }

  async dispose() {
    // Revalidate before deletion, including setup-failure cleanup. Never clear unrelated rows.
    testDatabaseUrl();
    try {
      const roomIds = this.rooms.map((room) => room.id);
      const userIds = this.users.map((user) => user.id);
      await this.db.booking.deleteMany({
        where: { OR: [{ roomId: { in: roomIds } }, { userId: { in: userIds } }] },
      });
      await this.db.room.deleteMany({ where: { id: { in: roomIds } } });
      await this.db.user.deleteMany({
        where: { OR: [{ id: { in: userIds } }, { email: { in: this.registeredEmails } }] },
      });
    } finally {
      await this.db.$disconnect();
    }
  }
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => {
    const scenario = new Scenario();
    try {
      await scenario.initialize();
      await use(scenario);
    } finally {
      await scenario.dispose();
    }
  },
});
export { expect };
