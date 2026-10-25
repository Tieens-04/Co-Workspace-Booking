import { test, expect, HOUR, tomorrowAt } from './fixtures.js';
import { login, prepareBooking } from './ui.js';
import { WEB_URL } from './env.js';

test('two customer browsers race for one slot: one 201, one 409 and one persisted booking', async ({
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
    const pages = await Promise.all([first.newPage(), second.newPage()]);
    await Promise.all([
      login(pages[0], scenario.customer),
      login(pages[1], scenario.otherCustomer),
    ]);
    const start = tomorrowAt();
    const end = new Date(start.getTime() + HOUR);
    await Promise.all(pages.map((page) => prepareBooking(page, scenario.room, start, end)));
    // Hold the actual POSTs until both browser preflight reads have completed. Responses
    // remain real; the barrier makes the database transaction/row lock decide the winner.
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    for (const page of pages)
      await page.route('**/api/v1/bookings', async (route) => {
        if (route.request().method() === 'POST') {
          if (++arrived === 2) release();
          await barrier;
        }
        await route.continue();
      });
    const results = pages.map((page) =>
      page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/bookings') && r.request().method() === 'POST',
      ),
    );
    await Promise.all(pages.map((page) => page.getByTestId('booking-confirm-btn').click()));
    const responses = await Promise.all(results);
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
    const winner = responses.findIndex((response) => response.status() === 201);
    await expect(pages[winner].getByTestId('booking-success-code')).toBeVisible();
    await expect(pages[1 - winner].getByTestId('booking-general-error')).toBeVisible();
    expect(
      await scenario.db.booking.count({
        where: {
          roomId: scenario.room.id,
          startTime: start,
          endTime: end,
          status: 'CONFIRMED',
        },
      }),
    ).toBe(1);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
