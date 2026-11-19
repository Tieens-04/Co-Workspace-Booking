-- CWB-122: Replace single-column bookings(user_id) index with composite (user_id, status, start_time)
-- and add composite rooms(status, name, id) index.
-- Create the new composite index BEFORE dropping `bookings_user_id_idx` so MySQL 8 InnoDB
-- seamlessly rebinds foreign key `bookings_user_id_fkey` online without ER_DROP_INDEX_FK (1553).

-- CreateIndex
CREATE INDEX `bookings_user_id_status_start_time_idx` ON `bookings`(`user_id`, `status`, `start_time`);

-- DropIndex
DROP INDEX `bookings_user_id_idx` ON `bookings`;

-- CreateIndex
CREATE INDEX `rooms_status_name_id_idx` ON `rooms`(`status`, `name`, `id`);
