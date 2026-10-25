import { test, expect, PASSWORD, HOUR, tomorrowAt, localInput } from './fixtures.js';
import { login, prepareBooking, submitBooking, api, noOverflow } from './ui.js';

test('register, reject wrong password, login and retain session after refresh', async ({
  page,
  scenario,
}) => {
  const email = `${scenario.prefix}-register@example.com`;
  scenario.registeredEmails.push(email);
  await page.goto('/register');
  await page
    .getByRole('textbox', { name: 'Họ và tên', exact: true })
    .fill('Browser Registered Customer');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(PASSWORD);
  await page.getByLabel(/^Xác nhận mật khẩu/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(email);
  await page.getByLabel(/^Mật khẩu/).fill('WrongPassword49!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Email hoặc mật khẩu không chính xác')).toBeVisible();
  await page.getByLabel(/^Mật khẩu/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/bookings');
  await page.reload();
  await expect(page).toHaveURL(/\/bookings$/);
  await noOverflow(page);
});

test('discover and filter rooms, book with server price, open detail and history directly', async ({
  page,
  scenario,
}, testInfo) => {
  await login(page, scenario.customer);
  await page.goto('/rooms');
  if (testInfo.project.name.includes('mobile'))
    await page.getByRole('button', { name: /^Bộ lọc/ }).click();
  await page.getByLabel('Sức chứa tối thiểu (người)').fill('6');
  if (testInfo.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Xem kết quả' }).click();
  await expect(
    page.getByRole('link', { name: new RegExp(scenario.room.name) }).first(),
  ).toBeVisible();
  await noOverflow(page);
  const start = tomorrowAt();
  await prepareBooking(page, scenario.room, start, new Date(start.getTime() + 2 * HOUR));
  await expect(page.getByTestId('review-estimated-total')).toContainText('200.000');
  const booking = await submitBooking(page);
  expect(booking.bookingCode).toMatch(/^CS-\d{8}-[A-Z0-9]{4}$/);
  expect(Number(booking.totalAmount)).toBe(200000);
  await page.getByTestId('confirmation-view-detail-btn').click();
  await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}$`));
  await page.reload();
  await expect(page.getByTestId('detail-booking-code')).toHaveText(booking.bookingCode);
  await expect(page.getByTestId('booking-total-value')).toContainText('200.000');
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('booking-detail.png'), fullPage: true });
  await page.goto('/bookings');
  await expect(page.getByText(booking.bookingCode, { exact: true })).toBeVisible();
});

test('customer cancellation persists and bookings under one hour cannot be cancelled', async ({
  page,
  scenario,
}) => {
  const booking = await scenario.booking();
  const near = Math.ceil((Date.now() + 10 * 60_000) / (HOUR / 2)) * (HOUR / 2);
  const nearBooking = await scenario.booking({
    startTime: new Date(near),
    endTime: new Date(near + HOUR),
  });
  await login(page, scenario.customer);
  await page.goto(`/bookings/${booking.id}`);
  await page.getByTestId('cancel-booking-init-btn').click();
  await page.getByTestId('confirm-cancel-btn').click();
  await expect(page.getByTestId('booking-status-badge')).toContainText('Đã hủy');
  await page.reload();
  await expect(page.getByTestId('booking-status-badge')).toContainText('Đã hủy');
  await page.goto(`/bookings/${nearBooking.id}`);
  await page.getByTestId('cancel-booking-init-btn').click();
  const rejected = page.waitForResponse((r) =>
    r.url().endsWith(`/bookings/${nearBooking.id}/cancel`),
  );
  await page.getByTestId('confirm-cancel-btn').click();
  expect((await rejected).status()).toBe(400);
  await expect(page.getByRole('alert').filter({ hasText: /1 giờ/ }).first()).toBeVisible();
  expect(
    (await scenario.db.booking.findUniqueOrThrow({ where: { id: nearBooking.id } })).status,
  ).toBe('CONFIRMED');
});

test('overlap and containment are unavailable while boundary-touching booking succeeds', async ({
  page,
  scenario,
}) => {
  const start = tomorrowAt();
  const existing = await scenario.booking({
    startTime: start,
    endTime: new Date(start.getTime() + 3 * HOUR),
    totalAmount: '300000.00',
  });
  await login(page, scenario.customer);
  await page.goto(`/rooms/${scenario.room.id}`);
  await page.getByLabel('Thời gian bắt đầu').fill(localInput(start));
  await page.getByLabel('Thời gian kết thúc').fill(localInput(new Date(start.getTime() + HOUR)));
  await expect(page.getByTestId('time-slot-10:00')).toBeDisabled();
  await page.getByTestId('booking-submit-btn').click();
  await expect(page.getByTestId('booking-general-error')).toBeVisible();
  await expect(page.getByTestId('booking-submit-btn')).toBeDisabled();
  for (const [from, to] of [
    [-1, 1],
    [1, 2],
  ]) {
    expect(
      (
        await api(page, '/bookings', 'POST', {
          roomId: scenario.room.id,
          startTime: new Date(start.getTime() + from * HOUR).toISOString(),
          endTime: new Date(start.getTime() + to * HOUR).toISOString(),
        })
      ).status(),
    ).toBe(409);
  }
  await prepareBooking(
    page,
    scenario.room,
    existing.endTime,
    new Date(existing.endTime.getTime() + HOUR),
  );
  await submitBooking(page);
});
