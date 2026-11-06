-- CWB-79: admin can lock a customer account. Additive and nullable: existing accounts stay active
-- (locked_at NULL), so deploying changes no current session or login.
-- AlterTable
ALTER TABLE `users` ADD COLUMN `locked_at` DATETIME(3) NULL,
    ADD COLUMN `lock_reason` VARCHAR(500) NULL;
