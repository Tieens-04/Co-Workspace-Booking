import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from '../layouts/AppHeader';
import * as authHooks from '../hooks/useAuth';

vi.mock('../hooks/useAuth');

describe('AppHeader', () => {
  it('renders guest navigation when not authenticated', () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      isAuthenticated: false,
      principal: null,
      token: null,
      isLoading: false,
      sessionExpired: false,
      clearSessionExpiredNotice: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>
    );

    expect(screen.getByText(/Co-Space/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Đăng nhập/i })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /Đăng ký/i })).toHaveAttribute('href', '/register');
  });

  it('renders customer navigation with role badge and booking history link when authenticated as CUSTOMER', () => {
    const logoutMock = vi.fn();
    vi.mocked(authHooks.useAuth).mockReturnValue({
      isAuthenticated: true,
      principal: {
        id: 'cust-1',
        email: 'customer@example.com',
        role: 'CUSTOMER',
        fullName: 'Nguyen Van A',
      },
      token: 'valid-token',
      isLoading: false,
      sessionExpired: false,
      clearSessionExpiredNotice: vi.fn(),
      login: vi.fn(),
      logout: logoutMock,
    });

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>
    );

    expect(screen.getByText(/Nguyen Van A/i)).toBeInTheDocument();
    expect(screen.getByText('CUSTOMER')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lịch sử đặt phòng/i })).toHaveAttribute('href', '/bookings');
    expect(screen.queryByRole('link', { name: /Khu vực Quản trị/i })).not.toBeInTheDocument();
  });

  it('renders admin navigation with admin area link when authenticated as ADMIN', async () => {
    const logoutMock = vi.fn();
    vi.mocked(authHooks.useAuth).mockReturnValue({
      isAuthenticated: true,
      principal: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'ADMIN',
        fullName: 'Admin User',
      },
      token: 'admin-token',
      isLoading: false,
      sessionExpired: false,
      clearSessionExpiredNotice: vi.fn(),
      login: vi.fn(),
      logout: logoutMock,
    });

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>
    );

    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Khu vực Quản trị/i })).toHaveAttribute('href', '/admin');

    const logoutBtn = screen.getByRole('button', { name: /Đăng xuất/i });
    await userEvent.click(logoutBtn);
    expect(logoutMock).toHaveBeenCalledWith('userAction');
  });
});
