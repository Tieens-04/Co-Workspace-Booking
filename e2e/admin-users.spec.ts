import { test, expect, PASSWORD } from './fixtures.js';
import { WEB_URL } from './env.js';
import { login, dialogKeyboard, noOverflow } from './ui.js';

test('admin locks a customer with a reason: session ends, login is refused, bookings are kept', async ({
  browser,
  page,
  scenario,
}, testInfo) => {
  const booking = await scenario.booking();
  const { viewport, isMobile, hasTouch, timezoneId, reducedMotion, locale } = testInfo.project.use;
  const customerContext = await browser.newContext({
    baseURL: WEB_URL,
    viewport,
    isMobile,
    hasTouch,
    timezoneId,
    reducedMotion,
    locale,
  });
  try {
    const customer = await customerContext.newPage();
    await login(customer, scenario.customer);

    await login(page, scenario.admin);
    await page.goto('/admin/users');
    await page.getByLabel('Email, tên hoặc số điện thoại').fill(scenario.customer.email);
    await page.getByTestId('user-apply').click();
    const row = page.getByTestId(`user-row-${scenario.customer.id}`);
    await expect(row).toContainText('1 sắp tới');
    const trigger = page.getByTestId(`user-toggle-${scenario.customer.id}`);
    await trigger.click();
    const dialog = page.getByTestId('user-status-modal');
    await dialogKeyboard(page, dialog, trigger);
    await expect(dialog.getByTestId('lock-warning')).toContainText('1 lượt đặt sắp tới');
    await dialog.getByLabel('Lý do').fill('Đặt giữ chỗ hàng loạt');
    await dialog.getByRole('button', { name: 'Xác nhận khóa' }).press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('affected-bookings')).toContainText(booking.bookingCode);
    await expect(row).toContainText('Đã khóa');
    await noOverflow(page);
    const kept = await scenario.db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(kept.status).toBe('CONFIRMED');

    // The customer's existing session is rejected on its next request.
    await customer.goto('/bookings');
    await expect(customer).toHaveURL(/\/login$/);
    await customer
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(scenario.customer.email);
    await customer.getByLabel(/^Mật khẩu/).fill(PASSWORD);
    await customer.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(
      customer.getByText('Tài khoản của bạn đã bị khóa', { exact: false }),
    ).toBeVisible();
    await expect(customer).toHaveURL(/\/login$/);
  } finally {
    await customerContext.close();
  }
});
