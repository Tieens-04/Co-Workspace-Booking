-- CWB-87: Email verification for new registrations.
-- Existing users are backfilled to current timestamp (considered verified).

-- AlterTable users
ALTER TABLE `users` ADD COLUMN `email_verified_at` DATETIME(3) NULL;

-- Backfill legacy users so they remain verified
UPDATE `users` SET `email_verified_at` = CURRENT_TIMESTAMP(3);

-- CreateTable email_verification_tokens
CREATE TABLE `email_verification_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `email_verification_tokens_token_hash_key`(`token_hash`),
    INDEX `email_verification_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `email_verification_tokens` ADD CONSTRAINT `email_verification_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable email_outbox
ALTER TABLE `email_outbox` MODIFY `kind` ENUM('BOOKING_CONFIRMATION', 'BOOKING_CANCELLATION', 'BOOKING_REMINDER', 'BOOKING_RESCHEDULED', 'EMAIL_VERIFICATION') NOT NULL;
ALTER TABLE `email_outbox` MODIFY `booking_id` VARCHAR(191) NULL;
ALTER TABLE `email_outbox` ADD COLUMN `user_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `email_outbox_user_id_idx` ON `email_outbox`(`user_id`);

-- AddForeignKey
ALTER TABLE `email_outbox` ADD CONSTRAINT `email_outbox_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
