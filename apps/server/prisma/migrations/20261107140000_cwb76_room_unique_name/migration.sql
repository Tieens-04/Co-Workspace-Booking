-- CWB-76: prevent duplicate room names (case-insensitive in MySQL utf8mb4 collation).
-- PRE-MIGRATION SAFETY CHECK:
-- Before running `prisma migrate deploy`, verify no duplicate room names exist in `rooms`:
--   SELECT name, COUNT(*) AS count FROM `rooms` GROUP BY name HAVING count > 1;
-- If duplicate rows exist from historical data, resolve them prior to deployment:
--   UPDATE `rooms` SET `name` = CONCAT(`name`, ' - ', SUBSTRING(`id`, 1, 8)) WHERE ...;
-- AlterTable
ALTER TABLE `rooms` ADD UNIQUE INDEX `rooms_name_key`(`name`);
