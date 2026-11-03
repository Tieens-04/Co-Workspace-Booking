-- CWB-67: append-only audit events table (additive; no FK so events outlive deleted rows).
-- CreateTable
CREATE TABLE `audit_events` (
    `id` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL AUTO_INCREMENT,
    `actor_id` VARCHAR(191) NOT NULL,
    `actor_role` ENUM('ADMIN', 'CUSTOMER') NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `entity_type` VARCHAR(32) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `audit_events_sequence_key`(`sequence`),
    INDEX `audit_events_entity_type_entity_id_sequence_idx`(`entity_type`, `entity_id`, `sequence`),
    INDEX `audit_events_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

