import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import prisma from '../utils/prisma.util.js';

afterAll(async () => {
  await prisma.$disconnect();
});

it('attendance migration preserves historical states and never infers arrival from payment', async () => {
  // Run the shipped SQL on a connection-local table, never on application records.
  const migration = readFileSync(
    new URL(
      '../../prisma/migrations/20261022100000_cwb39_booking_attendance/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const statements = migration
    .replaceAll('`bookings`', '`cwb39_migration_test`')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'CREATE TEMPORARY TABLE `cwb39_migration_test` (`id` VARCHAR(50) PRIMARY KEY, `start_time` DATETIME(3) NOT NULL, `end_time` DATETIME(3) NULL, `status` VARCHAR(20) NOT NULL, `payment_status` VARCHAR(20) NOT NULL)',
    );
    try {
      await tx.$executeRawUnsafe(statements[0]);
      await tx.$executeRawUnsafe(
        "INSERT INTO `cwb39_migration_test` (`id`, `start_time`, `status`, `payment_status`) VALUES ('past-paid', DATE_SUB(@attendance_cutover, INTERVAL 1 DAY), 'COMPLETED', 'PAID'), ('ongoing-unpaid', DATE_SUB(@attendance_cutover, INTERVAL 1 HOUR), 'CONFIRMED', 'UNPAID'), ('boundary-paid', @attendance_cutover, 'CONFIRMED', 'PAID'), ('future-paid', DATE_ADD(@attendance_cutover, INTERVAL 1 DAY), 'CONFIRMED', 'PAID'), ('past-noshow', DATE_SUB(@attendance_cutover, INTERVAL 1 DAY), 'NO_SHOW', 'PAID')",
      );
      for (const statement of statements.slice(1)) await tx.$executeRawUnsafe(statement);
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          status: string;
          payment_status: string;
          checked_in_at: Date | null;
          attendance_tracking_enabled: number;
        }>
      >('SELECT * FROM `cwb39_migration_test` ORDER BY id');
      expect(rows).toHaveLength(5);
      for (const row of rows) {
        expect(row.checked_in_at).toBeNull();
        expect(Boolean(row.attendance_tracking_enabled)).toBe(row.id === 'future-paid');
        expect(row.payment_status).toBe(row.id === 'ongoing-unpaid' ? 'UNPAID' : 'PAID');
        expect(row.status).toBe(
          row.id === 'past-paid' ? 'COMPLETED' : row.id === 'past-noshow' ? 'NO_SHOW' : 'CONFIRMED',
        );
      }
    } finally {
      await tx.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS `cwb39_migration_test`');
    }
  });
});
