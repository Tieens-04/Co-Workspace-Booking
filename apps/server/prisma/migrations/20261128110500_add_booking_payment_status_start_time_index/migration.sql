-- CreateIndex
CREATE INDEX `bookings_payment_status_start_time_id_idx` ON `bookings`(`payment_status`, `start_time`, `id`);
