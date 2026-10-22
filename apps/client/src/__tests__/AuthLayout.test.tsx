import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { roomApi } from '../services/room.api';

vi.mock('../services/room.api', () => ({
  roomApi: {
    getRooms: vi.fn(),
  },
}));

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<h1>Đăng nhập tài khoản</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const roomsResponse = (coverImage: string | null) => ({
  success: true,
  message: 'OK',
  data: {
    items: [
      {
        id: 'room-1',
        name: 'Phòng Hội Thảo Alpha',
        capacity: 8,
        pricePerHour: '200000.00',
        status: 'AVAILABLE' as const,
        coverImage,
        amenities: [],
      },
    ],
    pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
  },
});

describe('AuthLayout', () => {
  beforeEach(() => {
    vi.mocked(roomApi.getRooms).mockReset();
  });

  it('renders the form outlet and reads one room read-only with an abort signal', async () => {
    vi.mocked(roomApi.getRooms).mockResolvedValue(roomsResponse('https://img.example/alpha.jpg'));

    renderLayout();

    expect(screen.getByRole('heading', { name: 'Đăng nhập tài khoản' })).toBeInTheDocument();
    expect(roomApi.getRooms).toHaveBeenCalledWith({ page: 1, limit: 1 }, expect.any(AbortSignal));

    const photo = await screen.findByRole('img', { name: /Phòng Hội Thảo Alpha/i });
    expect(photo).toHaveAttribute('src', 'https://img.example/alpha.jpg');
    expect(screen.getByTestId('auth-visual')).toHaveAttribute('data-variant', 'photo');
  });

  it('falls back to the typographic ink panel when the room API fails', async () => {
    vi.mocked(roomApi.getRooms).mockRejectedValue(new Error('Network Error'));

    renderLayout();

    const panel = screen.getByTestId('auth-visual');
    await vi.waitFor(() => expect(panel).toHaveAttribute('data-variant', 'typographic'));
    expect(panel).toHaveTextContent('Không gian cho ý tưởng lớn.');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('falls back to the typographic panel when the room has no cover image', async () => {
    vi.mocked(roomApi.getRooms).mockResolvedValue(roomsResponse(null));

    renderLayout();

    const panel = screen.getByTestId('auth-visual');
    await vi.waitFor(() => expect(panel).toHaveAttribute('data-variant', 'typographic'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('falls back to the typographic panel when the photo fails to load', async () => {
    vi.mocked(roomApi.getRooms).mockResolvedValue(roomsResponse('https://img.example/broken.jpg'));

    renderLayout();

    const photo = await screen.findByRole('img', { name: /Phòng Hội Thảo Alpha/i });
    fireEvent.error(photo);

    expect(screen.getByTestId('auth-visual')).toHaveAttribute('data-variant', 'typographic');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('aborts the room request on unmount', () => {
    let signal: AbortSignal | undefined;
    vi.mocked(roomApi.getRooms).mockImplementation((_params, s) => {
      signal = s;
      return new Promise(() => {});
    });

    const { unmount } = renderLayout();
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('switches views between login and register with directional navigation', async () => {
    vi.mocked(roomApi.getRooms).mockResolvedValue(roomsResponse(null));

    function TestLogin() {
      const navigate = useNavigate();
      return (
        <div>
          <h1>Trang Đăng nhập</h1>
          <button type="button" onClick={() => navigate('/register')}>
            Chuyển sang đăng ký
          </button>
        </div>
      );
    }

    function TestRegister() {
      const navigate = useNavigate();
      return (
        <div>
          <h1>Trang Đăng ký</h1>
          <button type="button" onClick={() => navigate('/login')}>
            Chuyển sang đăng nhập
          </button>
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<TestLogin />} />
            <Route path="/register" element={<TestRegister />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Trang Đăng nhập' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang đăng ký' }));
    expect(await screen.findByRole('heading', { name: 'Trang Đăng ký' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang đăng nhập' }));
    expect(await screen.findByRole('heading', { name: 'Trang Đăng nhập' })).toBeInTheDocument();
  });
});
