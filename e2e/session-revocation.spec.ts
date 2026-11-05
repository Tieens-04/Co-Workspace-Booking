import { test, expect, PASSWORD } from './fixtures.js';
import { login } from './ui.js';
import { API_URL, WEB_URL } from './env.js';

const NEW_PASSWORD = 'RotatedBrowser49!';

// CWB-77: password change and "log out everywhere" revoke JWTs server-side; a second browser
// holding an older token is signed out by the existing 401 interceptor on its next request.
test('password change keeps this browser signed in and kicks the second session out; log out everywhere ends both', async ({
  browser,
  scenario,
}, testInfo) => {
  const { viewport, isMobile, hasTouch, timezoneId, reducedMotion, locale } = testInfo.project.use;
  const options = {
    baseURL: WEB_URL,
    viewport,
    isMobile,
    hasTouch,
    timezoneId,
    reducedMotion,
    locale,
  };
  const first = await browser.newContext(options);
  const second = await browser.newContext(options);
  try {
    const [primary, other] = await Promise.all([first.newPage(), second.newPage()]);
    await login(primary, scenario.customer);
    await login(other, scenario.customer);
    const staleToken = await other.evaluate(() => localStorage.getItem('cospace.accessToken'));

    await primary.goto('/account');
    await primary.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(PASSWORD);
    await primary.getByLabel('Mật khẩu mới', { exact: true }).fill(NEW_PASSWORD);
    await primary.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(NEW_PASSWORD);
    await primary.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await expect(primary.getByText('Mật khẩu đã được đổi.')).toBeVisible();

    // The second browser's token is revoked: its next API call returns 401 and it is signed out.
    const revoked = await other.request.get(`${API_URL}/api/v1/me`, {
      headers: { Authorization: `Bearer ${staleToken}` },
    });
    expect(revoked.status()).toBe(401);
    await other.goto('/bookings');
    await expect(other).toHaveURL(/\/login$/);
    await expect(other.getByText('Phiên làm việc đã hết hạn')).toBeVisible();
    expect(await other.evaluate(() => localStorage.getItem('cospace.accessToken'))).toBeNull();

    // This browser continues on the token issued for the new password.
    await primary.goto('/bookings');
    await expect(primary).toHaveURL(/\/bookings$/);

    // Sign the second browser in again, then end every session from the first one.
    await other.getByRole('textbox', { name: 'Email', exact: true }).fill(scenario.customer.email);
    await other.getByLabel(/^Mật khẩu/).fill(NEW_PASSWORD);
    await other.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(other).toHaveURL(/\/$/);

    await primary.goto('/account');
    await primary.getByTestId('account-logout-all-btn').click();
    await primary.getByTestId('account-logout-all-confirm').click();
    await expect(primary).toHaveURL(/\/login$/);

    await other.goto('/bookings');
    await expect(other).toHaveURL(/\/login$/);
    await expect(other.getByText('Phiên làm việc đã hết hạn')).toBeVisible();
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
