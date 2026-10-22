import { lazy, type ComponentType } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, MotionConfig, MotionGlobalConfig, domMax } from 'motion/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicLayout } from '../layouts/PublicLayout';
import { AdminLayout } from '../layouts/AdminLayout';
import { AuthLayout } from '../layouts/AuthLayout';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ principal: null, isAuthenticated: false, logout: vi.fn() }),
}));
vi.mock('../services/room.api', () => ({
  roomApi: { getRooms: () => Promise.resolve({ data: { items: [] } }) },
}));

function FormPage() {
  const navigate = useNavigate();
  return (
    <>
      <h1>Nội dung đã tải</h1>
      <input aria-label="Tên" />
      <button onClick={() => navigate('?page=2')}>Đổi bộ lọc</button>
    </>
  );
}

describe('page entrances', () => {
  beforeEach(() => {
    // Exercise real entrances; the general test setup skips animations.
    MotionGlobalConfig.skipAnimations = false;
  });
  afterEach(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  it.each([
    ['public', PublicLayout, '/rooms'],
    ['admin', AdminLayout, '/admin'],
    ['login', AuthLayout, '/login'],
    ['register', AuthLayout, '/register'],
  ] as const)(
    '%s keeps loading visible and animates the resolved page',
    async (_, Layout, path) => {
      let resolvePage!: (module: { default: ComponentType }) => void;
      const Page = lazy(
        () =>
          new Promise<{ default: ComponentType }>((resolve) => {
            resolvePage = resolve;
          }),
      );
      render(
        <LazyMotion features={domMax} strict>
          <MotionConfig reducedMotion="never">
            <MemoryRouter initialEntries={[path]}>
              <Routes>
                <Route element={<Layout />}>
                  <Route path={path} element={<Page />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </MotionConfig>
        </LazyMotion>,
      );

      const loading = screen.getByRole('status');
      expect(loading).toHaveTextContent('Đang tải trang');
      // The loading feedback must not consume the page's entrance animation.
      for (let node: HTMLElement | null = loading; node; node = node.parentElement) {
        expect(node.style.opacity).not.toBe('0');
      }

      await act(async () => resolvePage({ default: FormPage }));
      const entrance = screen.getByRole('heading', { name: 'Nội dung đã tải' }).parentElement!;
      expect(Number(entrance.style.opacity)).toBeLessThan(1);
      await waitFor(() => expect(entrance).toHaveStyle({ opacity: '1' }));
      expect(screen.queryByText('Đang tải trang...')).not.toBeInTheDocument();

      const input = screen.getByRole('textbox', { name: 'Tên' });
      fireEvent.change(input, { target: { value: 'An' } });
      fireEvent.click(screen.getByRole('button', { name: 'Đổi bộ lọc' }));
      expect(screen.getByRole('textbox', { name: 'Tên' })).toBe(input);
      expect(input).toHaveValue('An');
      expect(entrance).toHaveStyle({ opacity: '1' });
    },
  );
});
