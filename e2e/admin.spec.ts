import { test, expect, HOUR, HALF_HOUR, tomorrowAt, localInput } from './fixtures.js';
import { login, api, dialogKeyboard, noOverflow } from './ui.js';

for (const method of ['CASH', 'QR'] as const) {
  test(`admin confirms ${method} payment with accessible keyboard dialog`, async ({
    page,
    scenario,
  }, testInfo) => {
    const booking = await scenario.booking();
    await login(page, scenario.admin);
    await page.goto(`/admin/bookings?bookingCode=${booking.bookingCode}`);
    const trigger = page.getByTestId(`confirm-payment-btn-${booking.id}`);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Xác nhận thanh toán' });
    await dialogKeyboard(page, dialog, trigger);
    await dialog.getByLabel('Phương thức thanh toán').selectOption(method);
    await dialog.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId(`payment-status-${booking.id}`)).toHaveAttribute(
      'data-status',
      'PAID',
    );
    await expect(page.getByTestId(`booking-status-${booking.id}`)).toHaveAttribute(
      'data-status',
      'CONFIRMED',
    );
    await page.reload();
    await expect(page.getByTestId(`paid-method-label-${booking.id}`)).toHaveText(method);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`payment-${method}.png`), fullPage: true });
    expect(
      (await scenario.db.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentMethod,
    ).toBe(method);
  });
}

test('admin checks in current booking and completes an attended ended booking', async ({
  page,
  scenario,
}) => {
  const nowSlot = Math.floor(Date.now() / HALF_HOUR) * HALF_HOUR;
  const active = await scenario.booking({
    startTime: new Date(nowSlot - HALF_HOUR),
    endTime: new Date(nowSlot + 2 * HOUR),
    totalAmount: '250000.00',
  });
  const endedRoom = await scenario.createRoom();
  const endedStart = new Date(nowSlot - 4 * HOUR);
  const ended = await scenario.booking({
    roomId: endedRoom.id,
    startTime: endedStart,
    endTime: new Date(nowSlot - 2 * HOUR),
    checkedInAt: endedStart,
  });
  const futureRoom = await scenario.createRoom();
  const future = await scenario.booking({ roomId: futureRoom.id });
  await login(page, scenario.admin);
  await page.goto(`/admin/bookings?bookingCode=${active.bookingCode}`);
  await page.getByTestId(`check-in-booking-btn-${active.id}`).click();
  await expect(page.getByTestId(`attendance-${active.id}`)).toContainText('Đã check-in');
  await page.reload();
  await expect(page.getByTestId(`attendance-${active.id}`)).toContainText('Đã check-in');
  await expect(page.getByTestId(`payment-status-${active.id}`)).toHaveAttribute(
    'data-status',
    'UNPAID',
  );
  await page.goto(`/admin/bookings?bookingCode=${ended.bookingCode}`);
  await page.getByTestId(`complete-booking-btn-${ended.id}`).click();
  await expect(page.getByTestId(`booking-status-${ended.id}`)).toHaveAttribute(
    'data-status',
    'COMPLETED',
  );
  await page.reload();
  await expect(page.getByTestId(`booking-status-${ended.id}`)).toHaveAttribute(
    'data-status',
    'COMPLETED',
  );
  await page.goto(`/admin/bookings?bookingCode=${future.bookingCode}`);
  await expect(page.getByTestId(`admin-booking-row-${future.id}`)).toBeVisible();
  await expect(page.getByTestId(`check-in-booking-btn-${future.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`complete-booking-btn-${future.id}`)).toHaveCount(0);
  for (const action of ['check-in', 'complete'])
    expect((await api(page, `/admin/bookings/${future.id}/${action}`, 'PATCH', {})).status()).toBe(
      409,
    );
});

test('admin creates guest booking without creating a user', async ({ page, scenario }) => {
  await login(page, scenario.admin);
  await page.goto('/admin/bookings');
  const before = await scenario.db.user.count();
  await page.getByTestId('toggle-guest-form-btn').click();
  await page.getByTestId('guest-name-input').fill('Browser Guest');
  await page.getByTestId('guest-phone-input').fill('0912345678');
  await page.getByTestId('guest-room-select').selectOption(scenario.room.id);
  const start = tomorrowAt();
  await page.getByTestId('guest-start-time-input').fill(localInput(start));
  await page.getByTestId('guest-end-time-input').fill(localInput(new Date(start.getTime() + HOUR)));
  await expect(page.getByTestId('guest-submit-btn')).toBeEnabled();
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith('/admin/bookings/guest') && r.request().method() === 'POST',
  );
  await page.getByTestId('guest-submit-btn').click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const body = await response.json();
  await expect(page.getByText(body.data.bookingCode, { exact: true }).first()).toBeVisible();
  const persisted = await scenario.db.booking.findUniqueOrThrow({ where: { id: body.data.id } });
  expect(persisted.userId).toBeNull();
  expect(persisted.guestName).toBe('Browser Guest');
  expect(persisted.guestPhone).toBe('0912345678');
  expect(await scenario.db.user.count()).toBe(before);
  await noOverflow(page);
});

test('admin cancels with reason using keyboard dialog', async ({ page, scenario }) => {
  const booking = await scenario.booking();
  await login(page, scenario.admin);
  await page.goto(`/admin/bookings?bookingCode=${booking.bookingCode}`);
  const trigger = page.getByTestId(`cancel-booking-btn-${booking.id}`);
  await trigger.click();
  const dialog = page.getByTestId('admin-cancel-modal');
  await dialogKeyboard(page, dialog, trigger);
  await dialog.getByLabel('Lý do hủy đơn').fill('Guest requested cancellation');
  await dialog.getByRole('button', { name: 'Xác nhận hủy đơn' }).press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId(`booking-status-${booking.id}`)).toHaveAttribute(
    'data-status',
    'CANCELLED',
  );
  await page.reload();
  await expect(page.getByTestId(`cancellation-reason-${booking.id}`)).toContainText(
    'Guest requested cancellation',
  );
});

test('maintenance requires keyboard confirmation, retains future booking and blocks new booking', async ({
  page,
  scenario,
}) => {
  const booking = await scenario.booking();
  await login(page, scenario.admin);
  await page.getByTestId(`admin-edit-btn-${scenario.room.id}`).click();
  await page.getByLabel('Trạng thái phòng').selectOption('MAINTENANCE');
  const trigger = page.getByTestId('admin-submit-room-btn');
  await trigger.click();
  const warning = page.getByRole('alertdialog');
  await expect(warning).toContainText(booking.bookingCode);
  await dialogKeyboard(page, warning, trigger);
  await warning.getByRole('button', { name: 'Vẫn chuyển sang bảo trì' }).press('Enter');
  await expect(warning).toBeHidden();
  expect((await scenario.db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
    'CONFIRMED',
  );
  expect(
    (await scenario.db.room.findUniqueOrThrow({ where: { id: scenario.room.id } })).status,
  ).toBe('MAINTENANCE');
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.removeItem('cospace.accessToken'));
  await login(page, scenario.customer);
  await page.goto(`/rooms/${scenario.room.id}`);
  await expect(page.getByTestId('booking-maintenance-box')).toBeVisible();
  const start = tomorrowAt(14);
  expect(
    (
      await api(page, '/bookings', 'POST', {
        roomId: scenario.room.id,
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + HOUR).toISOString(),
      })
    ).status(),
  ).toBe(409);
});
