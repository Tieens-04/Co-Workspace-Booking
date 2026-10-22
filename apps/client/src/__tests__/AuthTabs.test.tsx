import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthTabs } from '../components/auth/AuthTabs';

describe('AuthTabs', () => {
  it('renders login and register tabs with active indicator', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<AuthTabs />} />
          <Route path="/register" element={<AuthTabs />} />
        </Routes>
      </MemoryRouter>,
    );

    const loginTab = screen.getByTestId('auth-tab-login');
    const registerTab = screen.getByTestId('auth-tab-register');

    expect(loginTab).toBeInTheDocument();
    expect(registerTab).toBeInTheDocument();
    expect(loginTab).toHaveAttribute('aria-selected', 'true');
    expect(registerTab).toHaveAttribute('aria-selected', 'false');
  });

  it('updates active tab when navigating to register', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <div>
                <AuthTabs />
                <p>Nội dung Đăng nhập</p>
              </div>
            }
          />
          <Route
            path="/register"
            element={
              <div>
                <AuthTabs />
                <p>Nội dung Đăng ký</p>
              </div>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    const registerTab = screen.getByTestId('auth-tab-register');
    fireEvent.click(registerTab);

    expect(screen.getByText('Nội dung Đăng ký')).toBeInTheDocument();
    expect(screen.getByTestId('auth-tab-register')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('auth-tab-login')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders nothing on non-auth paths', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/rooms']}>
        <Routes>
          <Route path="/rooms" element={<AuthTabs />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
