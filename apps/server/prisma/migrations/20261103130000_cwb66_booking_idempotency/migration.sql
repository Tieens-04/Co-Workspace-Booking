-- CWB-66: nullable idempotency columns; existing bookings keep NULL (unique index allows multiple NULLs).
-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `idempotency_hash` CHAR(64) NULL,
    ADD COLUMN `idempotency_key` VARCHAR(64) NULL,
    ADD COLUMN `idempotency_scope` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `bookings_idempotency_scope_key_key` ON `bookings`(`idempotency_scope`, `idempotency_key`);

