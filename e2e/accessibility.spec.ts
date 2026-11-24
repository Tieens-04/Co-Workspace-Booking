import { Prisma } from '@prisma/client';
import type { Locator, Page } from '@playwright/test';
import { test, expect, HOUR } from './fixtures.js';
import { login, noOverflow } from './ui.js';

async function expectSingleH1(page: Page, name?: string | RegExp) {
  const h1 = page.locator('h1');
  await expect(h1).toHaveCount(1);
  await expect(h1).toBeVisible();
  if (name) {
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }
}

async function expectMinTarget(locator: Locator, minSize = 24) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(minSize);
  expect(box!.height).toBeGreaterThanOrEqual(minSize);
}

test('public room discovery, detail, and not-found routes set titles, keep a single h1, and meet touch target sizes', async ({
  page,
  scenario,
}) => {
  const maintRoom = await scenario.db.room.create({
    data: {
      name: `${scenario.prefix}-maint`,
      capacity: 4,
      pricePerHour: new Prisma.Decimal('120000.00'),
      status: 'MAINTENANCE',
      statusHistory: {
        create: { status: 'MAINTENANCE', effectiveAt: new Date(Date.now() - 24 * HOUR) },
      },
    },
  });
  scenario.rooms.push(maintRoom);

  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle('Trang chủ · Co-Space');
  await expectSingleH1(page);
  await noOverflow(page);

  await page.getByRole('main').getByRole('link', { name: 'Khám phá không gian' }).first().click();
  await expect(page).toHaveURL(/\/rooms$/);
  await expect(page).toHaveTitle('Danh sách phòng · Co-Space');
  await expectSingleH1(page, 'Tìm phòng làm việc phù hợp');
  await noOverflow(page);

  const searchInput = page.getByRole('searchbox', { name: 'Tìm kiếm phòng theo tên' });
  await searchInput.fill(scenario.room.name);
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(scenario.room.name)}`));

  const detailLink = page.getByRole('link', { name: `Xem chi tiết ${scenario.room.name}` });
  await expectMinTarget(detailLink, 44);

  const clearSearchBtn = page.getByRole('button', { name: 'Xóa từ khóa tìm kiếm' });
  await expectMinTarget(clearSearchBtn, 24);

  const clearFiltersBtn = page.getByRole('button', { name: 'Xóa bộ lọc' });
  await expectMinTarget(clearFiltersBtn, 24);

  await detailLink.click();
  await expect(page).toHaveURL(new RegExp(`/rooms/${scenario.room.id}$`));
  await expect(page).toHaveTitle(`${scenario.room.name} · Co-Space`);
  await expectSingleH1(page, scenario.room.name);
  await noOverflow(page);

  await page.goBack();
  await expect(page).toHaveURL(/\/rooms/);
  await expect(page).toHaveTitle('Danh sách phòng · Co-Space');
  await clearSearchBtn.click();
  await expect(searchInput).toHaveValue('');
  await expect(page).toHaveURL(/\/rooms$/);

  await searchInput.fill(`${scenario.prefix}-no-match-xyz`);
  await expect(page.getByText('Không tìm thấy phòng phù hợp')).toBeVisible();
  await expectSingleH1(page, 'Tìm phòng làm việc phù hợp');
  const emptyClearBtn = page.getByRole('button', { name: 'Xóa bộ lọc' });
  await expectMinTarget(emptyClearBtn, 24);
  await emptyClearBtn.click();
  await expect(page).toHaveURL(/\/rooms$/);

  await page.goto(`/rooms/${maintRoom.id}`);
  await expect(page).toHaveURL(new RegExp(`/rooms/${maintRoom.id}$`));
  await expect(page).toHaveTitle(`${maintRoom.name} · Co-Space`);
  await expectSingleH1(page, maintRoom.name);
  await expectMinTarget(page.getByRole('link', { name: 'Xem phòng khác' }), 24);
  await noOverflow(page);

  await page.goto('/rooms/not-a-uuid');
  await expect(page).toHaveURL(/\/rooms\/not-a-uuid$/);
  await expect(page).toHaveTitle('Chi tiết phòng · Co-Space');
  await expectSingleH1(page, 'Không tìm thấy phòng');

  await page.goto('/khong-ton-tai-cwb-95');
  await expect(page).toHaveURL(/\/khong-ton-tai-cwb-95$/);
  await expect(page).toHaveTitle('Không tìm thấy trang · Co-Space');
  await expectSingleH1(page, '404');
});

test('auth and verification routes set Vietnamese titles, keep a single h1, and meet touch target sizes', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle('Đăng nhập · Co-Space');
  await expectSingleH1(page, 'Đăng nhập tài khoản');
  await expectMinTarget(page.getByRole('link', { name: 'Quên mật khẩu?' }), 24);
  const registerLink = page.getByRole('link', { name: 'Đăng ký ngay' });
  await expectMinTarget(registerLink, 24);
  await noOverflow(page);

  await registerLink.click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page).toHaveTitle('Đăng ký · Co-Space');
  await expectSingleH1(page, 'Đăng ký tài khoản');
  await expectMinTarget(page.getByRole('link', { name: 'Đăng nhập ngay' }), 24);
  await noOverflow(page);

  await page.goto('/forgot-password');
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page).toHaveTitle('Quên mật khẩu · Co-Space');
  await expectSingleH1(page, 'Quên mật khẩu');
  await expectMinTarget(page.getByRole('link', { name: 'Quay lại đăng nhập' }), 24);
  await noOverflow(page);

  await page.goto('/reset-password');
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page).toHaveTitle('Đặt lại mật khẩu · Co-Space');
  await expectSingleH1(page, 'Đặt lại mật khẩu');

  await page.goto('/verify-email');
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page).toHaveTitle('Xác thực email · Co-Space');
  await expectSingleH1(page, 'Xác thực Email');
});

test('customer routes set dynamic booking titles and keep a single h1 on empty, 404, and 403 states', async ({
  page,
  scenario,
}) => {
  const myBooking = await scenario.booking({ userId: scenario.customer.id });
  const otherRoom = await scenario.createRoom();
  const otherBooking = await scenario.booking({
    userId: scenario.otherCustomer.id,
    roomId: otherRoom.id,
  });

  await login(page, scenario.customer);

  await page.goto('/bookings');
  await expect(page).toHaveURL(/\/bookings$/);
  await expect(page).toHaveTitle('Lịch sử đặt phòng · Co-Space');
  await expectSingleH1(page, 'Lịch sử đặt phòng');
  await noOverflow(page);

  await page.goto(`/bookings/${myBooking.id}`);
  await expect(page).toHaveURL(new RegExp(`/bookings/${myBooking.id}$`));
  await expect(page).toHaveTitle(`Chi tiết đặt phòng ${myBooking.bookingCode} · Co-Space`);
  await expectSingleH1(page);
  await expectMinTarget(page.getByRole('link', { name: 'Quay lại lịch sử đặt phòng' }), 24);
  await noOverflow(page);

  await page.goto(`/bookings/${otherBooking.id}`);
  await expect(page).toHaveURL(new RegExp(`/bookings/${otherBooking.id}$`));
  await expect(page).toHaveTitle('Chi tiết đặt phòng · Co-Space');
  await expectSingleH1(page, 'Không tìm thấy thông tin đặt phòng');
  await noOverflow(page);

  await page.goto(`/booking-confirmation/${myBooking.id}`);
  await expect(page).toHaveURL(new RegExp(`/booking-confirmation/${myBooking.id}$`));
  await expect(page).toHaveTitle(`Xác nhận đặt phòng ${myBooking.bookingCode} · Co-Space`);
  await expectSingleH1(page, 'Đặt không gian làm việc thành công!');
  await noOverflow(page);

  await page.goto('/booking-confirmation');
  await expect(page).toHaveURL(/\/booking-confirmation$/);
  await expect(page).toHaveTitle('Xác nhận đặt phòng · Co-Space');
  await expectSingleH1(page, 'Không tìm thấy thông tin đặt phòng');
  await noOverflow(page);

  await page.goto(`/booking-confirmation/${otherBooking.id}`);
  await expect(page).toHaveURL(new RegExp(`/booking-confirmation/${otherBooking.id}$`));
  await expect(page).toHaveTitle('Xác nhận đặt phòng · Co-Space');
  await expectSingleH1(page, 'Không tìm thấy thông tin đặt phòng');

  await page.goto('/account');
  await expect(page).toHaveURL(/\/account$/);
  await expect(page).toHaveTitle('Thông tin tài khoản · Co-Space');
  await expectSingleH1(page, 'Thông tin tài khoản');
  await noOverflow(page);

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page).toHaveTitle('Không có quyền truy cập · Co-Space');
  await expectSingleH1(page, '403 - Không có quyền truy cập');
  await noOverflow(page);
});

test('admin routes set distinct titles, keep a single h1, and size closure filter checkbox', async ({
  page,
  scenario,
}) => {
  await login(page, scenario.admin);

  const adminRoutes: Array<{ path: string; title: string }> = [
    { path: '/admin', title: 'Quản lý phòng · Co-Space' },
    { path: '/admin/dashboard', title: 'Tổng quan quản trị · Co-Space' },
    { path: '/admin/bookings', title: 'Quản lý đặt phòng · Co-Space' },
    { path: '/admin/closures', title: 'Quản lý khung đóng cửa · Co-Space' },
    { path: '/admin/amenities', title: 'Danh mục tiện ích · Co-Space' },
    { path: '/admin/audit', title: 'Lịch sử thao tác · Co-Space' },
    { path: '/admin/emails', title: 'Email thông báo · Co-Space' },
    { path: '/admin/users', title: 'Khách hàng · Co-Space' },
  ];

  for (const route of adminRoutes) {
    await page.goto(route.path);
    await expect(page).toHaveURL(new RegExp(`${route.path}$`));
    await expect(page).toHaveTitle(route.title);
    await expectSingleH1(page);
    await noOverflow(page);

    if (route.path === '/admin/closures') {
      const checkbox = page.getByRole('checkbox', {
        name: 'Chỉ hiện khung sắp tới / đang diễn ra',
      });
      await expectMinTarget(checkbox, 24);
      await checkbox.check();
      await expect(checkbox).toBeChecked();
    }
  }
});
