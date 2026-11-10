-- CWB-89: payment time shown to the customer and a receipt email queued through the outbox.
-- Bookings paid before this migration keep paid_at NULL (the time was never recorded).

-- AlterTable bookings
ALTER TABLE `bookings` ADD COLUMN `paid_at` DATETIME(3) NULL;

-- AlterTable email_outbox
ALTER TABLE `email_outbox` MODIFY `kind` ENUM('BOOKING_CONFIRMATION', 'BOOKING_CANCELLATION', 'BOOKING_REMINDER', 'BOOKING_RESCHEDULED', 'EMAIL_VERIFICATION', 'PAYMENT_RECEIPT') NOT NULL;
