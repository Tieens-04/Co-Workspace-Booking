import { expect, type Page, type Locator } from '@playwright/test';
import type { User, Room } from '@prisma/client';
import { PASSWORD, localInput } from './fixtures.js';
import { API_URL } from './env.js';

export async function login(page: Page, user: Pick<User, 'email' | 'role'>) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email);
  await page.getByLabel(/^Mật khẩu/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(user.role === 'ADMIN' ? /\/admin$/ : /\/$/);
}

export async function prepareBooking(page: Page, room: Room, start: Date, end: Date) {
  await page.goto(`/rooms/${room.id}`);
  await expect(page.getByRole('heading', { name: room.name, exact: true })).toBeVisible();
  await page.getByLabel('Thời gian bắt đầu').fill(localInput(start));
  await page.getByLabel('Thời gian kết thúc').fill(localInput(end));
  await expect(page.getByTestId('booking-price-preview')).toBeVisible();
  await expect(page.getByTestId('booking-submit-btn')).toBeEnabled();
  await page.getByTestId('booking-submit-btn').click();
  await expect(page.getByTestId('booking-review-section')).toBeVisible();
}

export async function submitBooking(page: Page) {
  const result = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/bookings') && r.request().method() === 'POST',
  );
  await page.getByTestId('booking-confirm-btn').click();
  const response = await result;
  expect(response.status()).toBe(201);
  const body = await response.json();
  await expect(page.getByTestId('booking-success-code')).toHaveText(body.data.bookingCode);
  return body.data as { id: string; bookingCode: string; totalAmount: string };
}

export async function headers(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem('cospace.accessToken'));
  expect(token).toBeTruthy();
  return { Authorization: `Bearer ${token}` };
}

export async function api(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  data?: unknown,
) {
  return page.request.fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: await headers(page),
    data,
  });
}

export async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

export async function dialogKeyboard(page: Page, dialog: Locator, trigger: Locator) {
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
    .toBe(true);
  // Cycle beyond every tabbable control to exercise both ends of the focus trap.
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await expect(dialog).toBeVisible();
}
