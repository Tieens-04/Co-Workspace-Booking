-- CWB-80: reminder email kind. Appending an ENUM value is additive; existing rows keep their kind.
-- AlterTable
ALTER TABLE `email_outbox` MODIFY `kind` ENUM('BOOKING_CONFIRMATION', 'BOOKING_CANCELLATION', 'BOOKING_REMINDER') NOT NULL;
