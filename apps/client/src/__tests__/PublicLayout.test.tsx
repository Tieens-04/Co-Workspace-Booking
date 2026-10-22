import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout';
import { ThemeProvider } from '../context/ThemeContext';
import * as authHooks from '../hooks/useAuth';

vi.mock('../hooks/useAuth');

const renderLayout = () =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<h1>Trang chủ mẫu</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );

describe('PublicLayout', () => {
  beforeEach(() => {
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
  });

  it('renders header, main content and footer landmarks around the page', () => {
    renderLayout();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(within(main).getByRole('heading', { name: 'Trang chủ mẫu' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Co-Space Working');
  });

  it('provides a skip link to the main content as the first link', () => {
    renderLayout();

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent('Bỏ qua đến nội dung chính');
    expect(links[0]).toHaveAttribute('href', '#main-content');
  });

  it('switches to dark mode from the theme menu', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Chọn giao diện' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Tối' }));

    expect(document.documentElement).toHaveClass('dark');
  });
});
