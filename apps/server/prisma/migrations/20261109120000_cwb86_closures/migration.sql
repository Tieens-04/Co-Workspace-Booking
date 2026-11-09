-- CWB-86: Quản lý ngày nghỉ lễ và khung đóng cửa (toàn cơ sở hoặc theo phòng)
-- CreateTable
CREATE TABLE `closures` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `reason` TEXT NOT NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `closures_room_id_start_time_end_time_idx`(`room_id`, `start_time`, `end_time`),
    INDEX `closures_start_time_end_time_idx`(`start_time`, `end_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `closures` ADD CONSTRAINT `closures_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `closures` ADD CONSTRAINT `closures_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
