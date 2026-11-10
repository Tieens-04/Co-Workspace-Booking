import { test, expect, PASSWORD } from './fixtures.js';
import { dialogKeyboard, login } from './ui.js';

// CWB-88: a customer deletes (anonymizes) the account from the Account page. Upcoming bookings
// block it with a list to cancel first; afterwards the old credentials no longer sign in.
test('customer deletes the account after cancelling upcoming bookings', async ({
  page,
  scenario,
}) => {
  const upcoming = await scenario.booking();
  await login(page, scenario.customer);
  await page.goto('/account');

  const trigger = page.getByTestId('account-delete-btn');
  await trigger.click();
  const dialog = page.getByTestId('account-delete-dialog');
  await dialogKeyboard(page, dialog, trigger);

  const passwordField = dialog.getByLabel('Mật khẩu hiện tại', { exact: true });
  await passwordField.fill(PASSWORD);
  await passwordField.press('Enter');
  await expect(dialog.getByTestId('account-delete-blocking')).toContainText(upcoming.bookingCode);
  await expect(page).toHaveURL(/\/account$/);

  await scenario.db.booking.update({
    where: { id: upcoming.id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: 'CUSTOMER' },
  });
  await dialog.getByTestId('account-delete-confirm').click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('cospace.accessToken'))).toBeNull();

  const stored = await scenario.db.user.findUniqueOrThrow({ where: { id: scenario.customer.id } });
  expect(stored.deletedAt).not.toBeNull();
  expect(stored.email).toMatch(/@deleted\.invalid$/);
  expect(stored.phoneNumber).toBeNull();
  // The booking stays for accounting.
  expect(await scenario.db.booking.count({ where: { id: upcoming.id } })).toBe(1);

  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(scenario.customer.email);
  await page.getByLabel(/^Mật khẩu/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Email hoặc mật khẩu không chính xác')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
