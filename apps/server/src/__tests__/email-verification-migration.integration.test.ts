import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import prisma from '../utils/prisma.util.js';

afterAll(async () => {
  await prisma.$disconnect();
});

it('CWB-87 email verification migration backfills legacy users and leaves new users null', async () => {
  // Read shipped migration SQL
  const migration = readFileSync(
    new URL(
      '../../prisma/migrations/20261109150000_cwb87_email_verification/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );

  // Strip SQL comments and split into individual statements
  const statements = migration
    .split(';')
    .map((s) =>
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);

  const alterUsersStatement = statements.find((s) =>
    s.startsWith('ALTER TABLE `users` ADD COLUMN `email_verified_at`'),
  )!;

  const updateUsersStatement = statements.find((s) =>
    s.startsWith('UPDATE `users` SET `email_verified_at`'),
  )!;

  expect(alterUsersStatement).toBeDefined();
  expect(updateUsersStatement).toBeDefined();

  const testAlter = alterUsersStatement.replaceAll('`users`', '`cwb87_users_migration_test`');
  const testUpdate = updateUsersStatement.replaceAll('`users`', '`cwb87_users_migration_test`');

  await prisma.$transaction(async (tx) => {
    // 1. Create pre-migration table representing users before CWB-87 (no email_verified_at column)
    await tx.$executeRawUnsafe(
      'CREATE TEMPORARY TABLE `cwb87_users_migration_test` (`id` VARCHAR(191) PRIMARY KEY, `email` VARCHAR(191) NOT NULL, `full_name` VARCHAR(191) NOT NULL, `role` VARCHAR(20) NOT NULL, `created_at` DATETIME(3) NOT NULL)',
    );

    try {
      // 2. Insert legacy users existing prior to migration
      await tx.$executeRawUnsafe(
        "INSERT INTO `cwb87_users_migration_test` VALUES ('legacy-1', 'legacy1@example.com', 'Legacy Customer 1', 'CUSTOMER', '2026-10-01 00:00:00.000'), ('legacy-2', 'legacy2@example.com', 'Legacy Customer 2', 'CUSTOMER', '2026-10-15 00:00:00.000')",
      );

      // 3. Execute the shipped migration ALTER and UPDATE statements
      await tx.$executeRawUnsafe(testAlter);
      await tx.$executeRawUnsafe(testUpdate);

      // 4. Assert legacy users have non-null email_verified_at and intact identity fields
      const legacyRows = await tx.$queryRawUnsafe<
        Array<{ id: string; email: string; full_name: string; email_verified_at: Date | null }>
      >('SELECT id, email, full_name, email_verified_at FROM `cwb87_users_migration_test` ORDER BY id');

      expect(legacyRows).toHaveLength(2);
      for (const row of legacyRows) {
        expect(row.email_verified_at).not.toBeNull();
        expect(row.email_verified_at).toBeInstanceOf(Date);
      }
      expect(legacyRows[0].email).toBe('legacy1@example.com');
      expect(legacyRows[1].email).toBe('legacy2@example.com');

      // 5. Insert new user created after migration without specifying email_verified_at
      await tx.$executeRawUnsafe(
        "INSERT INTO `cwb87_users_migration_test` (`id`, `email`, `full_name`, `role`, `created_at`) VALUES ('new-user', 'new@example.com', 'New Customer', 'CUSTOMER', NOW(3))",
      );

      const newRow = await tx.$queryRawUnsafe<
        Array<{ id: string; email: string; email_verified_at: Date | null }>
      >("SELECT id, email, email_verified_at FROM `cwb87_users_migration_test` WHERE id = 'new-user'");

      expect(newRow).toHaveLength(1);
      expect(newRow[0].email_verified_at).toBeNull();
    } finally {
      await tx.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS `cwb87_users_migration_test`');
    }
  });
});
