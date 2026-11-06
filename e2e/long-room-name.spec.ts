import { test, expect } from './fixtures.js';
import { login, noOverflow } from './ui.js';

// CWB-72: room names are free text up to 191 characters; an unbroken one must never make a
// page scroll sideways. Rooms are listed newest first, so the scenario room is featured on `/`.
test('a 191-character unbroken room name never overflows customer or admin pages', async ({
  page,
  scenario,
}) => {
  const name = `PhongHopExecutiveBoardroomTang12${scenario.prefix.replaceAll('-', '')}`
    .repeat(8)
    .slice(0, 191);
  await scenario.db.room.update({ where: { id: scenario.room.id }, data: { name } });
  const booking = await scenario.booking();

  /** No page scroll is not enough: a clipped name is unreadable, so every visible copy must fit. */
  const nameFits = async () => {
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    for (const copy of await page.getByText(name, { exact: true }).all()) {
      if (!(await copy.isVisible())) continue;
      const box = await copy.boundingBox();
      expect(box && box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
  };

  const check = async (path: string) => {
    await page.goto(path);
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await noOverflow(page);
    await nameFits();
  };

  await page.goto('/');
  const featured = page.locator('section[aria-labelledby="landing-featured-title"]');
  await featured.scrollIntoViewIfNeeded();
  await expect(featured.getByRole('article').first()).toContainText(name);
  // The full name stays in the card link's accessible name.
  await expect(
    featured.getByRole('link', { name: `Xem chi tiết ${name}`, exact: true }),
  ).toBeAttached();
  await noOverflow(page);
  await nameFits();

  await check('/rooms');
  await check(`/rooms/${scenario.room.id}`);

  await login(page, scenario.customer);
  await check('/bookings');
  await check(`/bookings/${booking.id}`);

  await page.evaluate(() => localStorage.clear());
  await login(page, scenario.admin);
  await check('/admin');
  await check(`/admin/bookings?bookingCode=${booking.bookingCode}`);
});
