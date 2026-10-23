import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import prisma from '../utils/prisma.util.js';

afterAll(async () => {
  await prisma.$disconnect();
});

it('backfills current status at creation without modifying room records', async () => {
  const migration = readFileSync(
    new URL(
      '../../prisma/migrations/20261023000000_cwb42_room_status_history/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  // Exercise the shipped data migration on connection-local tables, never application data.
  const insert = migration
    .slice(migration.indexOf('INSERT INTO'))
    .replaceAll('`room_status_history`', '`cwb42_history_test`')
    .replaceAll('`rooms`', '`cwb42_rooms_test`');
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'CREATE TEMPORARY TABLE `cwb42_rooms_test` (`id` VARCHAR(191) PRIMARY KEY, `status` VARCHAR(20) NOT NULL, `created_at` DATETIME(3) NOT NULL)',
    );
    await tx.$executeRawUnsafe(
      'CREATE TEMPORARY TABLE `cwb42_history_test` (`id` VARCHAR(191) PRIMARY KEY, `room_id` VARCHAR(191) NOT NULL, `status` VARCHAR(20) NOT NULL, `effective_at` DATETIME(3) NOT NULL, UNIQUE (`room_id`, `effective_at`))',
    );
    try {
      await tx.$executeRawUnsafe(
        "INSERT INTO `cwb42_rooms_test` VALUES ('available', 'AVAILABLE', '2026-10-01 00:00:00.123'), ('maintenance', 'MAINTENANCE', '2026-10-02 00:00:00.456')",
      );
      await tx.$executeRawUnsafe(insert);
      const rows = await tx.$queryRawUnsafe<
        Array<{ room_id: string; status: string; effective_at: Date }>
      >('SELECT room_id, status, effective_at FROM `cwb42_history_test` ORDER BY room_id');
      expect(rows).toEqual([
        {
          room_id: 'available',
          status: 'AVAILABLE',
          effective_at: new Date('2026-10-01T00:00:00.123Z'),
        },
        {
          room_id: 'maintenance',
          status: 'MAINTENANCE',
          effective_at: new Date('2026-10-02T00:00:00.456Z'),
        },
      ]);
      const count = await tx.$queryRawUnsafe<Array<{ total: bigint }>>(
        'SELECT COUNT(*) AS total FROM `cwb42_rooms_test`',
      );
      expect(Number(count[0].total)).toBe(2);
    } finally {
      await tx.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS `cwb42_history_test`');
      await tx.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS `cwb42_rooms_test`');
    }
  });
});
