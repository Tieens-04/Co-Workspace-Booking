import { test, expect, tomorrowAt, localInput, HOUR } from './fixtures.js';
import { login, noOverflow } from './ui.js';

test('admin manages closures: creates room closure, customer sees closed slot, admin deletes closure', async ({
  page,
  browser,
  scenario,
}) => {
  // 1. Admin login and navigate to closures management
  await login(page, scenario.admin);
  await page.goto('/admin/closures');
  await expect(page.getByRole('heading', { name: 'Quản lý khung đóng cửa' })).toBeVisible();

  // 2. Open create modal
  await page.getByTestId('btn-add-closure').click();
  await expect(page.getByText('Thêm khung đóng cửa mới')).toBeVisible();

  // Choose room scope
  await page.getByTestId('closure-scope-select').selectOption('ROOM');
  await page.getByTestId('closure-room-select').selectOption(scenario.room.id);

  // Set time: tomorrow 09:00 - 12:00
  const start = tomorrowAt(9);
  const end = tomorrowAt(12);
  const tomorrowDateStr = localInput(start).slice(0, 10);
  await page.getByTestId('closure-start-time').fill(localInput(start));
  await page.getByTestId('closure-end-time').fill(localInput(end));
  await page.getByTestId('closure-reason').fill('Bảo trì máy điều hòa định kỳ');

  // Submit form
  await page.getByTestId('btn-submit-closure').click();

  // 3. Verify closure row is present in the table
  await expect(page.getByText('Thêm khung đóng cửa mới')).toBeHidden();
  const table = page.getByTestId('closures-table');
  await expect(table).toContainText(scenario.room.name);
  await expect(table).toContainText('Bảo trì máy điều hòa định kỳ');
  await noOverflow(page);

  // 4. Customer visits room detail page and sees CLOSED slots disabled on TimeGrid
  const customerContext = await browser.newContext();
  try {
    const customerPage = await customerContext.newPage();
    await login(customerPage, scenario.customer);
    await customerPage.goto(`/rooms/${scenario.room.id}`);
    await expect(
      customerPage.getByRole('heading', { name: scenario.room.name, exact: true }),
    ).toBeVisible();

    await customerPage.getByTestId('booking-view-date-input').fill(tomorrowDateStr);

    for (const [label, endLabel] of [
      ['09:00', '09:30'],
      ['09:30', '10:00'],
      ['10:00', '10:30'],
      ['10:30', '11:00'],
      ['11:00', '11:30'],
      ['11:30', '12:00'],
    ]) {
      const slotBtn = customerPage.getByTestId(`time-slot-${label}`);
      await expect(slotBtn).toBeDisabled();
      await expect(slotBtn).toHaveAttribute('data-slot-state', 'closed');
      await expect(slotBtn).toHaveAttribute(
        'aria-label',
        `${label} - ${endLabel}: Đóng cửa (Bảo trì máy điều hòa định kỳ)`,
      );
    }

    // Slot 12:00 (boundary) should remain available
    const boundarySlot = customerPage.getByTestId('time-slot-12:00');
    await expect(boundarySlot).toBeEnabled();
    await expect(boundarySlot).toHaveAttribute('data-slot-state', 'available');

    // 5. Admin deletes closure
    await page.goto('/admin/closures');
    await expect(page.getByTestId('closures-table')).toBeVisible();

    const deleteBtn = page.locator('button[data-testid^="btn-delete-closure-"]').first();
    await deleteBtn.click();

    await expect(page.getByText('Xác nhận xóa khung đóng cửa')).toBeVisible();
    await page.getByTestId('btn-confirm-delete-closure').click();
    await expect(page.getByText('Chưa có khung đóng cửa nào')).toBeVisible();

    // 6. Customer refreshes room page and sees previously closed slots available again
    await customerPage.reload();
    await customerPage.getByTestId('booking-view-date-input').fill(tomorrowDateStr);
    const reopenedSlot = customerPage.getByTestId('time-slot-09:00');
    await expect(reopenedSlot).toBeEnabled();
    await expect(reopenedSlot).toHaveAttribute('data-slot-state', 'available');
  } finally {
    await customerContext.close();
  }
});

test('admin creates closure with conflict warning when confirmed booking exists', async ({
  page,
  scenario,
}) => {
  // Create an existing confirmed booking tomorrow 10:00 - 12:00
  const bookingStart = tomorrowAt(10);
  const booking = await scenario.booking({
    startTime: bookingStart,
    endTime: new Date(bookingStart.getTime() + 2 * HOUR),
  });

  // Admin login and navigate to closures
  await login(page, scenario.admin);
  await page.goto('/admin/closures');

  // Create closure covering 09:00 - 13:00 (overlaps with booking)
  await page.getByTestId('btn-add-closure').click();
  await page.getByTestId('closure-scope-select').selectOption('ROOM');
  await page.getByTestId('closure-room-select').selectOption(scenario.room.id);

  const closureStart = tomorrowAt(9);
  const closureEnd = tomorrowAt(13);
  await page.getByTestId('closure-start-time').fill(localInput(closureStart));
  await page.getByTestId('closure-end-time').fill(localInput(closureEnd));
  await page.getByTestId('closure-reason').fill('Sửa chữa đột xuất đường ống');

  await page.getByTestId('btn-submit-closure').click();

  // Conflict warning modal should pop up
  await expect(page.getByText('Cảnh báo xung đột đặt phòng')).toBeVisible();
  await expect(page.getByTestId('conflicting-bookings-table')).toContainText(booking.bookingCode);

  // Confirm despite conflict
  await page.getByTestId('btn-confirm-conflict-closure').click();

  // Closure should now be saved and listed in the table
  const table = page.getByTestId('closures-table');
  await expect(table).toContainText(scenario.room.name);
  await expect(table).toContainText('Sửa chữa đột xuất đường ống');

  // Existing booking must remain CONFIRMED
  const keptBooking = await scenario.db.booking.findUniqueOrThrow({
    where: { id: booking.id },
  });
  expect(keptBooking.status).toBe('CONFIRMED');
});

test('closure acknowledgement alerts affected booking in admin & customer UI and supports cross-room reschedule (CWB-91)', async ({
  page,
  browser,
  scenario,
}) => {
  const alternateRoom = await scenario.createRoom();
  const bookingStart = tomorrowAt(10);
  const booking = await scenario.booking({
    startTime: bookingStart,
    endTime: new Date(bookingStart.getTime() + 2 * HOUR),
  });

  // 1. Admin creates a closure overlapping the existing booking and acknowledges conflicts
  await login(page, scenario.admin);
  await page.goto('/admin/closures');
  await page.getByTestId('btn-add-closure').click();
  await page.getByTestId('closure-scope-select').selectOption('ROOM');
  await page.getByTestId('closure-room-select').selectOption(scenario.room.id);

  await page.getByTestId('closure-start-time').fill(localInput(tomorrowAt(9)));
  await page.getByTestId('closure-end-time').fill(localInput(tomorrowAt(13)));
  await page.getByTestId('closure-reason').fill('Khung đóng cửa E2E CWB-91');
  await page.getByTestId('btn-submit-closure').click();

  await expect(page.getByText('Cảnh báo xung đột đặt phòng')).toBeVisible();
  await page.getByTestId('btn-confirm-conflict-closure').click();
  await expect(page.getByTestId('closures-table')).toContainText('Khung đóng cửa E2E CWB-91');

  // Verify DB state: EmailOutbox queued BOOKING_ROOM_UNAVAILABLE without mutating booking/payment
  const outboxRow = await scenario.db.emailOutbox.findFirst({
    where: { bookingId: booking.id, kind: 'BOOKING_ROOM_UNAVAILABLE' },
  });
  expect(outboxRow).not.toBeNull();
  const keptBooking = await scenario.db.booking.findUniqueOrThrow({
    where: { id: booking.id },
  });
  expect(keptBooking.status).toBe('CONFIRMED');
  expect(keptBooking.paymentStatus).toBe('UNPAID');

  // 2. Admin inspects /admin/bookings and filters needsAttention=true
  await page.goto('/admin/bookings');
  await expect(page.getByTestId('admin-bookings-table')).toBeVisible();
  await page.getByTestId('filter-needs-attention').check();
  await expect(page.getByTestId(`admin-booking-unavailable-badge-${booking.id}`)).toBeVisible();
  await expect(page.getByTestId('admin-bookings-table')).toContainText('Khung đóng cửa E2E CWB-91');

  // 3. Customer views booking detail, sees alert banner, and reschedules to alternateRoom
  const customerContext = await browser.newContext();
  try {
    const customerPage = await customerContext.newPage();
    await login(customerPage, scenario.customer);
    await customerPage.goto(`/bookings/${booking.id}`);

    const banner = customerPage.getByTestId('room-unavailable-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Khung đóng cửa E2E CWB-91');

    await customerPage.getByTestId('reschedule-booking-init-btn').click();
    await expect(customerPage.getByTestId('reschedule-dialog-content')).toBeVisible();

    const roomSelect = customerPage.getByTestId('reschedule-room-select');
    await expect(roomSelect).toBeVisible();
    await roomSelect.selectOption(alternateRoom.id);

    await customerPage.getByTestId('time-slot-10:00').click();
    await customerPage.getByTestId('time-slot-11:30').click();
    await customerPage.getByTestId('reschedule-confirm-btn').click();

    await expect(customerPage.getByTestId('room-unavailable-banner')).toBeHidden();
    await expect(customerPage.getByTestId('booking-room-value')).toContainText(alternateRoom.name);
  } finally {
    await customerContext.close();
  }
});
