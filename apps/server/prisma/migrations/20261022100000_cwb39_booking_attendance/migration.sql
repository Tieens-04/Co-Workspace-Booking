-- Capture one UTC cutover. Payment never proves attendance.
SET @attendance_cutover = UTC_TIMESTAMP(3);
ALTER TABLE `bookings`
    ADD COLUMN `checked_in_at` DATETIME(3) NULL,
    ADD COLUMN `attendance_tracking_enabled` BOOLEAN NOT NULL DEFAULT true;
UPDATE `bookings` SET `attendance_tracking_enabled` = false
WHERE `start_time` <= @attendance_cutover;
CREATE INDEX `bookings_attendance_no_show_idx`
ON `bookings` (`status`, `attendance_tracking_enabled`, `checked_in_at`, `end_time`);
