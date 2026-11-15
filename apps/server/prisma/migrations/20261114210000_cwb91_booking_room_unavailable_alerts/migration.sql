ALTER TABLE `email_outbox`
  MODIFY `kind` ENUM(
    'BOOKING_CONFIRMATION',
    'BOOKING_CANCELLATION',
    'BOOKING_REMINDER',
    'BOOKING_RESCHEDULED',
    'EMAIL_VERIFICATION',
    'PAYMENT_RECEIPT',
    'BOOKING_ROOM_UNAVAILABLE'
  ) NOT NULL,
  ADD COLUMN `event_key` VARCHAR(191) NOT NULL DEFAULT '' AFTER `booking_id`,
  DROP INDEX `email_outbox_kind_booking_key`,
  ADD UNIQUE INDEX `email_outbox_kind_booking_event_key`(`kind`, `booking_id`, `event_key`);
