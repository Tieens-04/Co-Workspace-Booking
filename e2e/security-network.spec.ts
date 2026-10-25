import { test, expect, HOUR, tomorrowAt } from './fixtures.js';
import { login, api, headers, prepareBooking, submitBooking, noOverflow } from './ui.js';
import { API_URL } from './env.js';

test('401, admin 403 and customer ownership protect reads and cancellation', async ({
  page,
  scenario,
}) => {
  const booking = await scenario.booking({ userId: scenario.otherCustomer.id });
  expect((await page.request.get(`${API_URL}/api/v1/bookings`)).status()).toBe(401);
  await page.goto(`/bookings/${booking.id}`);
  await expect(page).toHaveURL(/\/login$/);
  await login(page, scenario.customer);
  expect((await api(page, '/admin/bookings')).status()).toBe(403);
  expect((await api(page, `/bookings/${booking.id}`)).status()).toBe(404);
  expect((await api(page, `/bookings/${booking.id}/cancel`, 'PATCH', {})).status()).toBe(404);
  await page.goto(`/bookings/${booking.id}`);
  await expect(page.getByTestId('booking-not-found-state')).toBeVisible();
  await expect(page.getByText(booking.bookingCode, { exact: true })).toHaveCount(0);
  await page.goto('/admin/bookings');
  await expect(page.getByRole('heading', { name: '403 - Không có quyền truy cập' })).toBeVisible();
  expect((await api(page, '/bookings')).status()).toBe(200);
  expect((await scenario.db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
    'CONFIRMED',
  );
});

test('invalid persisted token expires session on real API 401', async ({ page, scenario }) => {
  await login(page, scenario.customer);
  const auth = await headers(page);
  const token = auth.Authorization.slice(7);
  // Keep readable identity/expiry so the client attempts the request; server rejects the
  // signature. This does not manufacture a valid token or bypass authentication.
  const parts = token.split('.');
  parts[2] = `${parts[2][0] === 'a' ? 'b' : 'a'}${parts[2].slice(1)}`;
  await page.evaluate(
    (value) => localStorage.setItem('cospace.accessToken', value),
    parts.join('.'),
  );
  await page.goto('/bookings');
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.'),
  ).toBeVisible();
});

test('read network failure displays retry and recovers without fake API data', async ({
  page,
  scenario,
}, testInfo) => {
  await login(page, scenario.customer);
  await page.route('**/api/v1/rooms?**', (route) => route.abort('failed'));
  await page.goto('/rooms');
  await expect(page.getByRole('button', { name: /Thử lại/ }).first()).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('network-read-error.png'), fullPage: true });
  await page.unroute('**/api/v1/rooms?**');
  await page
    .getByRole('button', { name: /Thử lại/ })
    .first()
    .click();
  await expect(
    page.getByRole('link', { name: `Xem chi tiết ${scenario.room.name}` }),
  ).toBeVisible();
});

test('failed booking request displays an error, creates nothing, then retry succeeds', async ({
  page,
  scenario,
}) => {
  await login(page, scenario.customer);
  const start = tomorrowAt();
  await prepareBooking(page, scenario.room, start, new Date(start.getTime() + HOUR));
  await page.route('**/api/v1/bookings', async (route) => {
    if (route.request().method() === 'POST') await route.abort('failed');
    else await route.continue();
  });
  await page.getByTestId('booking-confirm-btn').click();
  await expect(page.getByTestId('booking-general-error')).toBeVisible();
  expect(await scenario.db.booking.count({ where: { roomId: scenario.room.id } })).toBe(0);
  await page.unroute('**/api/v1/bookings');
  await submitBooking(page);
  expect(await scenario.db.booking.count({ where: { roomId: scenario.room.id } })).toBe(1);
});
