-- CWB-82: Store cancelledAt timestamp and cancelledBy role (CUSTOMER | ADMIN)
-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `cancelled_at` DATETIME(3) NULL,
    ADD COLUMN `cancelled_by` ENUM('ADMIN', 'CUSTOMER') NULL;
