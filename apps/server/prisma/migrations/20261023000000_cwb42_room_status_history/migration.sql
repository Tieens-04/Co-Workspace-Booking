CREATE TABLE `room_status_history` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `status` ENUM('AVAILABLE', 'MAINTENANCE') NOT NULL,
    `effective_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `room_status_history_room_id_effective_at_key` (`room_id`, `effective_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `room_status_history` ADD CONSTRAINT `room_status_history_room_id_fkey`
FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Historical transitions are unknown: assume each existing room's current status
-- has applied since its creation. Future transitions are recorded explicitly.
INSERT INTO `room_status_history` (`id`, `room_id`, `status`, `effective_at`)
SELECT UUID(), `id`, `status`, `created_at` FROM `rooms`;
