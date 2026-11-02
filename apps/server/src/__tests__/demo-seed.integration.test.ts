import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { assertDemoSeedAllowed } from '../../prisma/demo-seed-guard.js';
import { DEMO_USER_EMAILS, seedDemoData } from '../../prisma/seed.js';

describe('Demo seed on the integration database (CWB-59)', () => {
  const demoEmails = Object.values(DEMO_USER_EMAILS);
  let roomIdsBefore: Set<string>;
  let amenityIdsBefore: Set<string>;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Integration setup points DATABASE_URL at the verified *_test database.
    expect(assertDemoSeedAllowed(process.env)).toMatch(/_test$/);
    roomIdsBefore = new Set(
      (await prisma.room.findMany({ select: { id: true } })).map((r) => r.id),
    );
    amenityIdsBefore = new Set(
      (await prisma.amenity.findMany({ select: { id: true } })).map((a) => a.id),
    );
  });

  afterAll(async () => {
    // Remove only what the seed created; cascades clean images, amenities links and history.
    await prisma.user.deleteMany({ where: { email: { in: demoEmails } } });
    const rooms = await prisma.room.findMany({ select: { id: true } });
    await prisma.room.deleteMany({
      where: { id: { in: rooms.map((r) => r.id).filter((id) => !roomIdsBefore.has(id)) } },
    });
    const amenities = await prisma.amenity.findMany({ select: { id: true } });
    await prisma.amenity.deleteMany({
      where: { id: { in: amenities.map((a) => a.id).filter((id) => !amenityIdsBefore.has(id)) } },
    });
    vi.restoreAllMocks();
  });

  it('is idempotent when run twice and uses reserved demo email domains', async () => {
    await seedDemoData(prisma);
    const snapshot = async () => ({
      users: await prisma.user.findMany({
        where: { email: { in: demoEmails } },
        select: { email: true, role: true, passwordHash: true },
        orderBy: { email: 'asc' },
      }),
      rooms: await prisma.room.count(),
      amenities: await prisma.amenity.count(),
      images: await prisma.roomImage.count(),
      links: await prisma.roomAmenity.count(),
    });
    const first = await snapshot();

    await seedDemoData(prisma);
    const second = await snapshot();

    expect(second).toEqual(first);
    expect(first.users).toHaveLength(3);
    expect(first.users.every((u) => u.email.endsWith('.example'))).toBe(true);
    expect(first.users.find((u) => u.email === DEMO_USER_EMAILS.admin)?.role).toBe(Role.ADMIN);
    expect(first.users.every((u) => u.passwordHash.startsWith('$2'))).toBe(true);
  });
});
