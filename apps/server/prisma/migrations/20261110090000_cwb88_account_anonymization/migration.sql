-- CWB-88: self-service account deletion anonymizes the user row instead of deleting it, so
-- bookings (onDelete: Restrict), revenue and the audit trail stay intact. Non-null = anonymized.

-- AlterTable users
ALTER TABLE `users` ADD COLUMN `deleted_at` DATETIME(3) NULL;
