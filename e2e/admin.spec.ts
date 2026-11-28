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
  await expect(page.getByRole('alertdialog', { name: 'Xác nhận hoàn tất ca' })).toBeVisible();
  await page.getByTestId('lifecycle-confirm-submit-btn').click();
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

test('admin books for an existing verified customer and attaches to customer history', async ({
  page,
  scenario,
}) => {
  await login(page, scenario.admin);
  await page.goto('/admin/bookings');
  await page.getByTestId('toggle-guest-form-btn').click();
  await page.getByTestId('booking-mode-customer').click();
  await page.getByTestId('customer-search-input').fill(scenario.customer.email);
  const option = page.getByTestId(`customer-option-${scenario.customer.id}`);
  await expect(option).toBeEnabled();
  await option.click();
  await expect(page.getByTestId('selected-customer-card')).toContainText(scenario.customer.email);

  await page.getByTestId('guest-room-select').selectOption(scenario.room.id);
  const start = tomorrowAt(13);
  await page.getByTestId('guest-start-time-input').fill(localInput(start));
  await page.getByTestId('guest-end-time-input').fill(localInput(new Date(start.getTime() + HOUR)));
  await expect(page.getByTestId('guest-submit-btn')).toBeEnabled();

  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith('/admin/bookings') && r.request().method() === 'POST',
  );
  await page.getByTestId('guest-submit-btn').click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const body = await response.json();
  await expect(page.getByTestId('guest-booking-success-box')).toContainText(
    scenario.customer.email,
  );
  await expect(page.getByText(body.data.bookingCode, { exact: true }).first()).toBeVisible();

  const persisted = await scenario.db.booking.findUniqueOrThrow({ where: { id: body.data.id } });
  expect(persisted.userId).toBe(scenario.customer.id);
  expect(persisted.guestName).toBeNull();
  expect(persisted.guestPhone).toBeNull();

  const audit = await scenario.db.auditEvent.findFirst({
    where: { entityType: 'BOOKING', entityId: body.data.id, action: 'BOOKING_CREATED_BY_ADMIN' },
  });
  expect(audit).not.toBeNull();

  const outbox = await scenario.db.emailOutbox.findFirst({
    where: { bookingId: body.data.id, kind: 'BOOKING_CONFIRMATION' },
  });
  expect(outbox).not.toBeNull();
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

test('admin archives room with future booking, retains booking, hides from public, filters by status and unarchives', async ({
  page,
  scenario,
}) => {
  const room = await scenario.createRoom();
  const booking = await scenario.booking({ roomId: room.id });
  await login(page, scenario.admin);
  await page.getByTestId(`admin-edit-btn-${room.id}`).click();
  await page.getByLabel('Trạng thái phòng').selectOption('ARCHIVED');
  const trigger = page.getByTestId('admin-submit-room-btn');
  await trigger.click();
  const warning = page.getByRole('alertdialog');
  await expect(warning).toContainText(booking.bookingCode);
  await dialogKeyboard(page, warning, trigger);
  await warning.getByRole('button', { name: 'Vẫn chuyển sang ngừng kinh doanh' }).press('Enter');
  await expect(warning).toBeHidden();

  // Verify DB state: booking remains CONFIRMED, room is ARCHIVED
  expect((await scenario.db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
    'CONFIRMED',
  );
  expect((await scenario.db.room.findUniqueOrThrow({ where: { id: room.id } })).status).toBe(
    'ARCHIVED',
  );

  // Verify public view: hidden from /rooms list and 404s on /rooms/:id
  await page.goto('/rooms');
  await expect(page.getByText(room.name)).toHaveCount(0);
  const detailRes = await api(page, `/rooms/${room.id}`);
  expect(detailRes.status()).toBe(404);

  // Admin view: filter by ARCHIVED, edit and unarchive back to AVAILABLE
  await page.goto('/admin');
  await page.getByTestId('admin-room-status-filter').selectOption('ARCHIVED');
  await expect(page.getByText(room.name)).toBeVisible();

  await page.getByTestId(`admin-edit-btn-${room.id}`).click();
  await page.getByLabel('Trạng thái phòng').selectOption('AVAILABLE');
  await page.getByTestId('admin-submit-room-btn').click();

  await expect(page.getByText('Cập nhật thông tin phòng thành công!')).toBeVisible();
  expect((await scenario.db.room.findUniqueOrThrow({ where: { id: room.id } })).status).toBe(
    'AVAILABLE',
  );
});

test('admin dashboard formats fractional room-minutes as vi-VN hours without overflow', async ({
  page,
  scenario,
}) => {
  await login(page, scenario.admin);

  const today = localInput(new Date()).slice(0, 10);
  const weekSafeStart = new Date(new Date(`${today}T00:00:00.000+07:00`).getTime() - 7 * 24 * HOUR);
  await scenario.db.room.update({
    where: { id: scenario.room.id },
    data: {
      createdAt: weekSafeStart,
      statusHistory: {
        updateMany: {
          where: { roomId: scenario.room.id },
          data: { effectiveAt: weekSafeStart },
        },
      },
    },
  });

  const createdAt = new Date(`${today}T05:17:17.123+07:00`);
  const fractionalRoom = await scenario.db.room.create({
    data: {
      name: `${scenario.prefix}-fractional`,
      capacity: 6,
      pricePerHour: '100000.00',
      createdAt,
      statusHistory: {
        create: { status: 'AVAILABLE', effectiveAt: createdAt },
      },
    },
  });
  scenario.rooms.push(fractionalRoom);

  const bookingStart = new Date(`${today}T08:00:00+07:00`);
  await scenario.booking({
    roomId: fractionalRoom.id,
    startTime: bookingStart,
    endTime: new Date(bookingStart.getTime() + HOUR),
    status: 'COMPLETED',
    paymentStatus: 'PAID',
    totalAmount: '100000.00',
  });

  const viHoursFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  const strictViNumber = /^(?:0|[1-9]\d{0,2}(?:\.\d{3})*)(?:,[1-9])?$/;
  const expectedOccupancyText = (kpi: { bookedMinutes: number; totalRoomMinutes: number }) => {
    const booked = kpi.bookedMinutes > 0 ? viHoursFormatter.format(kpi.bookedMinutes / 60) : '0';
    const total =
      kpi.totalRoomMinutes > 0 ? viHoursFormatter.format(kpi.totalRoomMinutes / 60) : '0';
    expect(booked).toMatch(strictViNumber);
    expect(total).toMatch(strictViNumber);
    return `Đã đặt ${booked} giờ / ${total} giờ khả dụng`;
  };

  const dayKpiResponse = page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/admin/dashboard/kpi') &&
      r.url().includes('period=day') &&
      r.request().method() === 'GET',
  );
  const scheduleResponse = page.waitForResponse(
    (r) => r.url().includes('/api/v1/admin/dashboard/schedule') && r.request().method() === 'GET',
  );
  await page.goto('/admin/dashboard');
  const [dayKpiRes, scheduleRes] = await Promise.all([dayKpiResponse, scheduleResponse]);
  expect(dayKpiRes.ok()).toBe(true);
  expect(scheduleRes.ok()).toBe(true);
  const dayKpiBody = (await dayKpiRes.json()) as {
    data: { totalRoomMinutes: number; bookedMinutes: number };
  };
  expect(Number.isInteger(dayKpiBody.data.totalRoomMinutes)).toBe(false);
  expect(dayKpiBody.data.bookedMinutes).toBeGreaterThanOrEqual(60);

  const occupancyCard = page.getByTestId('kpi-card-occupancy');
  const occupancyHours = page.getByTestId('kpi-occupancy-hours');
  await expect(occupancyHours).toHaveText(expectedOccupancyText(dayKpiBody.data));
  await expect(occupancyCard).not.toContainText('phút');
  await expect(page.getByTestId('kpi-total-rooms')).toBeVisible();
  await expect(page.getByTestId('dashboard-schedule-skeleton')).toBeHidden();
  await noOverflow(page);

  const weekKpiResponse = page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/admin/dashboard/kpi') &&
      r.url().includes('period=week') &&
      r.request().method() === 'GET',
  );
  await page.getByTestId('filter-period-week-btn').click();
  const weekKpiRes = await weekKpiResponse;
  expect(weekKpiRes.ok()).toBe(true);
  const weekKpiBody = (await weekKpiRes.json()) as {
    data: { totalRoomMinutes: number; bookedMinutes: number };
  };
  expect(Number.isInteger(weekKpiBody.data.totalRoomMinutes)).toBe(false);
  expect(weekKpiBody.data.totalRoomMinutes).toBeGreaterThan(dayKpiBody.data.totalRoomMinutes);

  await expect(page.getByTestId('kpi-card-bookings')).toContainText('ĐẶT PHÒNG TRONG TUẦN');
  await expect(occupancyHours).toHaveText(expectedOccupancyText(weekKpiBody.data));
  await expect(occupancyCard).not.toContainText('phút');
  await noOverflow(page);
});

test('admin reschedules a PAID booking across rooms with price-delta confirmation and keyboard dialog (CWB-98)', async ({
  page,
  scenario,
}) => {
  const targetRoom = await scenario.db.room.create({
    data: {
      name: `${scenario.prefix}-reschedule-vip`,
      capacity: 8,
      pricePerHour: '200000.00',
      statusHistory: {
        create: { status: 'AVAILABLE', effectiveAt: new Date(Date.now() - 48 * HOUR) },
      },
    },
  });
  scenario.rooms.push(targetRoom);

  const paidBooking = await scenario.booking({
    paymentStatus: 'PAID',
    paymentMethod: 'QR',
    paidAt: new Date(),
  });

  await login(page, scenario.admin);
  await page.goto(`/admin/bookings?bookingCode=${paidBooking.bookingCode}`);

  const trigger = page.getByTestId(`reschedule-booking-btn-${paidBooking.id}`);
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Đổi lịch đặt phòng' });
  await dialogKeyboard(page, dialog, trigger);

  await dialog.getByTestId('reschedule-room-select').selectOption(targetRoom.id);
  await dialog.getByTestId('time-slot-14:00').click();
  await dialog.getByTestId('time-slot-15:30').click();

  await expect(dialog.getByTestId('reschedule-paid-delta-warning')).toBeVisible();
  await expect(dialog.getByTestId('reschedule-confirm-btn')).toBeDisabled();

  await dialog.getByTestId('reschedule-ack-price-delta').check();
  await dialog.getByTestId('reschedule-reason-input').fill('Chuyển phòng lớn và thu thêm tại quầy');

  const patchPromise = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/admin/bookings/${paidBooking.id}`) && r.request().method() === 'PATCH',
  );
  await dialog.getByTestId('reschedule-confirm-btn').click();
  const patchRes = await patchPromise;
  expect(patchRes.status()).toBe(200);
  await expect(dialog).toBeHidden();

  const updated = await scenario.db.booking.findUniqueOrThrow({ where: { id: paidBooking.id } });
  expect(updated.bookingCode).toBe(paidBooking.bookingCode);
  expect(updated.roomId).toBe(targetRoom.id);
  expect(updated.totalAmount.toFixed(2)).toBe('400000.00');
  expect(updated.paymentStatus).toBe('PAID');

  const audit = await scenario.db.auditEvent.findFirst({
    where: { entityType: 'BOOKING', entityId: paidBooking.id, action: 'BOOKING_RESCHEDULED' },
    orderBy: { sequence: 'desc' },
  });
  expect(audit?.actorRole).toBe('ADMIN');
  await noOverflow(page);
});

test('admin filters bookings by room, paymentStatus, date range, partial 4-char bookingCode, and needsRefund with URL persistence (CWB-100)', async ({
  page,
  scenario,
}) => {
  const otherRoom = await scenario.db.room.create({
    data: {
      name: `${scenario.prefix}-filter-room-2`,
      capacity: 6,
      pricePerHour: '150000.00',
      statusHistory: {
        create: { status: 'AVAILABLE', effectiveAt: new Date(Date.now() - 48 * HOUR) },
      },
    },
  });
  scenario.rooms.push(otherRoom);

  const unpaidBooking = await scenario.booking({
    paymentStatus: 'UNPAID',
    status: 'CONFIRMED',
  });
  const refundableBooking = await scenario.booking({
    roomId: otherRoom.id,
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentMethod: 'QR',
    paidAt: new Date(),
    cancelledAt: new Date(),
    cancellationReason: 'Khách đổi kế hoạch',
  });

  const vnDay = new Date(unpaidBooking.startTime.getTime() + 7 * HOUR).toISOString().slice(0, 10);

  await login(page, scenario.admin);
  await page.goto('/admin/bookings');

  await page.getByTestId('filter-room-select').selectOption(scenario.room.id);
  await page.getByTestId('filter-payment-status-select').selectOption('UNPAID');
  await page.getByTestId('filter-from-input').fill(vnDay);
  await page.getByTestId('filter-to-input').fill(vnDay);
  const partialSuffix = unpaidBooking.bookingCode.slice(-4);
  await page.getByTestId('filter-booking-code-input').fill(partialSuffix.toLowerCase());
  await page.getByTestId('apply-filters-btn').click();

  await expect(page.getByText(unpaidBooking.bookingCode, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(refundableBooking.bookingCode, { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('filter-room-select')).toHaveValue(scenario.room.id);
  await expect(page.getByTestId('filter-payment-status-select')).toHaveValue('UNPAID');
  await expect(page.getByTestId('filter-from-input')).toHaveValue(vnDay);
  await expect(page.getByTestId('filter-to-input')).toHaveValue(vnDay);
  await expect(page.getByTestId('filter-booking-code-input')).toHaveValue(
    partialSuffix.toUpperCase(),
  );
  await expect(page.getByText(unpaidBooking.bookingCode, { exact: true }).first()).toBeVisible();

  await page.getByTestId('clear-filters-btn').click();
  await page.getByTestId('filter-room-select').selectOption(otherRoom.id);
  await page.getByTestId('filter-needs-refund').check();

  await expect(
    page.getByText(refundableBooking.bookingCode, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(unpaidBooking.bookingCode, { exact: true })).toHaveCount(0);

  await noOverflow(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await noOverflow(page);
});
