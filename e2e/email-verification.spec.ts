import crypto from 'node:crypto';
import { test, expect, PASSWORD, HOUR, tomorrowAt } from './fixtures.js';
import { prepareBooking, submitBooking, noOverflow } from './ui.js';

test('unverified user is blocked from booking, verifies via link, and can then book', async ({
  page,
  scenario,
}) => {
  const email = `${scenario.prefix}-verify@example.com`;
  scenario.registeredEmails.push(email);

  // 1. Register a new user (which defaults to unverified)
  await page.goto('/register');
  await page.getByRole('textbox', { name: 'Họ và tên', exact: true }).fill('Unverified Customer');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(PASSWORD);
  await page.getByLabel(/^Xác nhận mật khẩu/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();

  await expect(page).toHaveURL(/\/login$/);

  // 2. Log in as the newly registered unverified user
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  // Find the created user record in database
  const user = await scenario.db.user.findUniqueOrThrow({ where: { email } });
  expect(user.emailVerifiedAt).toBeNull();

  // 3. Navigate to room booking and verify notice is displayed
  await page.goto(`/rooms/${scenario.room.id}`);
  await expect(page.getByTestId('email-verification-notice')).toBeVisible();

  // 4. Try to submit a booking while unverified
  const start = tomorrowAt(10);
  const end = new Date(start.getTime() + 2 * HOUR);
  await prepareBooking(page, scenario.room, start, end);

  // Confirm booking button triggers server 403 EMAIL_NOT_VERIFIED
  await page.getByTestId('booking-confirm-btn').click();
  await expect(page.getByTestId('email-verification-notice')).toBeVisible();
  await expect(page.getByTestId('booking-general-error')).toContainText(
    'Vui lòng xác thực email trước khi đặt phòng',
  );

  // 5. Issue a valid verification token for this user
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await scenario.db.emailVerificationToken.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  // 6. Navigate to verification URL with token
  await page.goto(`/verify-email?token=${rawToken}`);

  // URL query token should be stripped immediately for privacy
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByTestId('verify-email-confirm')).toBeVisible();

  // Click confirmation button
  await page.getByTestId('verify-email-confirm-btn').click();
  await expect(page.getByTestId('verify-email-success')).toBeVisible();

  // DB reflects verified state
  const updatedUser = await scenario.db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(updatedUser.emailVerifiedAt).not.toBeNull();

  // 7. Return to room page and complete the booking
  await page.goto(`/rooms/${scenario.room.id}`);
  await prepareBooking(page, scenario.room, start, end);
  const booking = await submitBooking(page);

  expect(booking.bookingCode).toMatch(/^CS-\d{8}-[A-Z0-9]{4}$/);
  expect(Number(booking.totalAmount)).toBe(200000);

  await noOverflow(page);
});
