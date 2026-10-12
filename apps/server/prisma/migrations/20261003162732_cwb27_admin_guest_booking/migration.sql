-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `guest_name` VARCHAR(191) NULL,
    ADD COLUMN `guest_phone` VARCHAR(191) NULL,
    MODIFY `user_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `bookings_start_time_id_idx` ON `bookings`(`start_time`, `id`);
