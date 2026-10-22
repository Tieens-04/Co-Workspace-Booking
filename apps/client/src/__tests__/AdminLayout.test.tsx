import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '../layouts/AdminLayout';
import * as authHooks from '../hooks/useAuth';

vi.mock('../hooks/useAuth');

const logoutMock = vi.fn();

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<div>Rooms Screen</div>} />
          <Route path="dashboard" element={<div>Dashboard Screen</div>} />
          <Route path="bookings" element={<div>Bookings Screen</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('AdminLayout', () => {
  beforeEach(() => {
    logoutMock.mockReset();
    vi.mocked(authHooks.useAuth).mockReturnValue({
      isAuthenticated: true,
      principal: { id: 'admin-1', email: 'admin@cospace.vn', role: 'ADMIN', fullName: 'Quản Trị' },
      token: 'valid-token',
      isLoading: false,
      sessionExpired: false,
      clearSessionExpiredNotice: vi.fn(),
      login: vi.fn(),
      logout: logoutMock,
    });
  });

  it('renders the admin navigation with links to every admin section', () => {
    renderAt('/admin/bookings');

    const nav = screen.getByRole('navigation', { name: 'Điều hướng quản trị' });
    expect(within(nav).getByTestId('admin-nav-dashboard')).toHaveAttribute(
      'href',
      '/admin/dashboard',
    );
    expect(within(nav).getByTestId('admin-nav-rooms')).toHaveAttribute('href', '/admin');
    expect(within(nav).getByTestId('admin-nav-bookings')).toHaveAttribute(
      'href',
      '/admin/bookings',
    );
    expect(within(nav).getByTestId('admin-nav-bookings')).toHaveTextContent('Quản lý đặt phòng');
    expect(screen.getByText('Bookings Screen')).toBeInTheDocument();
  });

  it('marks only the active section with aria-current="page"', () => {
    renderAt('/admin/bookings');

    expect(screen.getByTestId('admin-nav-bookings')).toHaveAttribute('aria-current', 'page');
    // The rooms link uses `end`, so /admin/bookings must not activate it.
    expect(screen.getByTestId('admin-nav-rooms')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('admin-nav-dashboard')).not.toHaveAttribute('aria-current');
  });

  it('activates the rooms link on the /admin index route', () => {
    renderAt('/admin');

    expect(screen.getByTestId('admin-nav-rooms')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Rooms Screen')).toBeInTheDocument();
  });

  it('logs out from the sidebar', async () => {
    const user = userEvent.setup();
    renderAt('/admin/dashboard');

    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(logoutMock).toHaveBeenCalledWith('userAction');
  });

  it('opens the mobile menu sheet with the same navigation', async () => {
    const user = userEvent.setup();
    renderAt('/admin/dashboard');

    expect(screen.getAllByRole('navigation', { name: 'Điều hướng quản trị' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Mở menu quản trị' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Quản trị Co-Space')).toBeInTheDocument();
    expect(within(dialog).getByTestId('admin-nav-bookings')).toHaveAttribute(
      'href',
      '/admin/bookings',
    );
  });
});
