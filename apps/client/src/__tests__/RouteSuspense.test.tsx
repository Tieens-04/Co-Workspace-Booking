import { describe, it, expect, vi, afterEach } from 'vitest';
import { lazy, type ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { RouteSuspense } from '../components/RouteSuspense';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

function Shell() {
  return (
    <div>
      <nav>
        <Link to="/broken">Broken</Link>
        <Link to="/ok">Ok</Link>
      </nav>
      <RouteSuspense>
        <Outlet />
      </RouteSuspense>
    </div>
  );
}

describe('RouteSuspense (CWB-58)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the loading state while a lazy route chunk downloads', async () => {
    const chunk = deferred<{ default: ComponentType }>();
    const Page = lazy(() => chunk.promise);

    render(
      <MemoryRouter initialEntries={['/page']}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="page" element={<Page />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải trang...');
    chunk.resolve({ default: () => <p>Trang đã tải</p> });
    expect(await screen.findByText('Trang đã tải')).toBeInTheDocument();
  });

  it('keeps the layout, offers a reload on chunk failure, and recovers on navigation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const BrokenPage = lazy(() =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    );

    render(
      <MemoryRouter initialEntries={['/broken']}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="broken" element={<BrokenPage />} />
            <Route path="ok" element={<p>Trang khác</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const fallback = await screen.findByTestId('route-error');
    expect(fallback).toHaveTextContent('Không thể tải trang');
    expect(screen.getByTestId('route-error-retry')).toHaveTextContent('Tải lại trang');
    expect(screen.getByRole('navigation')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Ok' }));
    expect(await screen.findByText('Trang khác')).toBeInTheDocument();
    expect(screen.queryByTestId('route-error')).not.toBeInTheDocument();
  });
});
