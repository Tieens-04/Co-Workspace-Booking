import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from '../pages/HomePage';
import { AuthProvider } from '../context/AuthContext';
import { roomApi } from '../services/room.api';
import type { Amenity, ApiResponse, GetRoomsResponseData, RoomListItem } from '../types/room';

vi.mock('../services/room.api', () => ({
  roomApi: {
    getRooms: vi.fn(),
    getRoomById: vi.fn(),
    getAmenities: vi.fn(),
  },
}));

const amenities: Amenity[] = [
  { id: 'a-1', name: 'Wi-Fi tốc độ cao', icon: 'wifi', description: 'Kết nối ổn định cả ngày' },
  { id: 'a-2', name: 'Cà phê', icon: 'coffee', description: null },
];

const rooms: RoomListItem[] = [
  {
    id: 'room-1',
    name: 'Focus Room Creative',
    capacity: 4,
    pricePerHour: '180000.00',
    status: 'AVAILABLE',
    coverImage: 'https://images.example.com/room1.jpg',
    amenities: [amenities[0]],
  },
  {
    id: 'room-2',
    name: 'Meeting Room Grand',
    capacity: 12,
    pricePerHour: '450000.00',
    status: 'MAINTENANCE',
    coverImage: null,
    amenities: [],
  },
  {
    id: 'room-3',
    name: 'Studio Loft',
    capacity: 8,
    pricePerHour: '300000.00',
    status: 'AVAILABLE',
    coverImage: 'https://images.example.com/room3.jpg',
    amenities: [],
  },
  {
    id: 'room-4',
    name: 'Phòng thứ tư',
    capacity: 2,
    pricePerHour: '100000.00',
    status: 'AVAILABLE',
    coverImage: null,
    amenities: [],
  },
];

const roomsResponse = (items: RoomListItem[] = rooms): ApiResponse<GetRoomsResponseData> => ({
  success: true,
  message: 'Thành công',
  data: { items, pagination: { page: 1, limit: 6, total: items.length, totalPages: 1 } },
});

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

const renderAt = (entry = '/') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/rooms" element={<p>Rooms explorer</p>} />
        </Routes>
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  );

describe('HomePage landing', () => {
  beforeEach(() => {
    vi.mocked(roomApi.getRooms).mockReset();
    vi.mocked(roomApi.getAmenities).mockReset();
    vi.mocked(roomApi.getRooms).mockResolvedValue(roomsResponse());
    vi.mocked(roomApi.getAmenities).mockResolvedValue({
      success: true,
      message: 'Thành công',
      data: amenities,
    });
  });

  it('renders the hero headline as one sentence and a CTA to /rooms', async () => {
    renderAt();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Không gian cho ý tưởng lớn.' }),
    ).toBeInTheDocument();
    const ctas = screen.getAllByRole('link', { name: /Khám phá không gian/ });
    expect(ctas[0]).toHaveAttribute('href', '/rooms');
    expect(roomApi.getRooms).toHaveBeenCalledWith({ page: 1, limit: 6 }, expect.any(AbortSignal));
    await screen.findByRole('link', { name: 'Xem chi tiết Focus Room Creative' });
  });

  it('uses the first real room photo in the hero with a caption link', async () => {
    renderAt();
    const hero = screen.getByRole('region', { name: 'Không gian cho ý tưởng lớn.' });
    const heroImage = await within(hero).findByRole('img', {
      name: 'Không gian Focus Room Creative',
    });
    expect(heroImage).not.toHaveAttribute('loading', 'lazy');
    const caption = heroImage.closest('figure') as HTMLElement;
    expect(within(caption).getByRole('link', { name: 'Focus Room Creative' })).toHaveAttribute(
      'href',
      '/rooms/room-1',
    );
  });

  it('features up to three rooms from the API with price, capacity and detail links', async () => {
    vi.mocked(roomApi.getRooms).mockResolvedValue(roomsResponse(rooms.slice(0, 3)));
    renderAt();
    const featured = screen.getByRole('region', { name: 'Chọn nơi hợp với nhịp làm việc.' });

    expect(
      await within(featured).findByRole('heading', { name: 'Focus Room Creative' }),
    ).toBeInTheDocument();
    expect(
      within(featured).getByRole('heading', { name: 'Meeting Room Grand' }),
    ).toBeInTheDocument();
    expect(within(featured).getByRole('heading', { name: 'Studio Loft' })).toBeInTheDocument();

    expect(within(featured).getByText(/180\.000 đ\/giờ/)).toBeInTheDocument();
    expect(within(featured).getByText(/450\.000 đ\/giờ/)).toBeInTheDocument();
    expect(within(featured).getByText('12 người')).toBeInTheDocument();

    expect(
      within(featured).getByRole('link', { name: 'Xem chi tiết Meeting Room Grand' }),
    ).toHaveAttribute('href', '/rooms/room-2');
    expect(within(featured).getByRole('link', { name: 'Xem tất cả không gian' })).toHaveAttribute(
      'href',
      '/rooms',
    );

    const maintenanceCard = within(featured)
      .getByRole('heading', { name: 'Meeting Room Grand' })
      .closest('article') as HTMLElement;
    expect(within(maintenanceCard).getByText('Bảo trì')).toHaveAttribute(
      'data-status',
      'MAINTENANCE',
    );
  });

  it('showcases bookable rooms before maintenance ones and caps the list at three', async () => {
    renderAt();
    const featured = screen.getByRole('region', { name: 'Chọn nơi hợp với nhịp làm việc.' });

    expect(
      await within(featured).findByRole('heading', { name: 'Focus Room Creative' }),
    ).toBeInTheDocument();
    expect(within(featured).getByRole('heading', { name: 'Studio Loft' })).toBeInTheDocument();
    expect(within(featured).getByRole('heading', { name: 'Phòng thứ tư' })).toBeInTheDocument();
    expect(
      within(featured).queryByRole('heading', { name: 'Meeting Room Grand' }),
    ).not.toBeInTheDocument();
  });

  it('shows a retry action when rooms fail to load and refetches on click', async () => {
    vi.mocked(roomApi.getRooms)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(roomsResponse());
    const user = userEvent.setup();
    renderAt();

    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    expect(screen.getByText(/Không tải được danh sách không gian/)).toBeInTheDocument();

    await user.click(retry);

    expect(
      await screen.findByRole('link', { name: 'Xem chi tiết Focus Room Creative' }),
    ).toBeInTheDocument();
    expect(roomApi.getRooms).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('shows a short line with a link when there are no rooms', async () => {
    vi.mocked(roomApi.getRooms).mockResolvedValue(roomsResponse([]));
    renderAt();
    expect(await screen.findByText(/Chưa có không gian nào để giới thiệu/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở trang không gian' })).toHaveAttribute(
      'href',
      '/rooms',
    );
  });

  it('lists real amenities and hides the section when the call fails', async () => {
    const { unmount } = renderAt();
    expect(await screen.findByRole('heading', { name: 'Wi-Fi tốc độ cao' })).toBeInTheDocument();
    expect(screen.getByText('Kết nối ổn định cả ngày')).toBeInTheDocument();
    unmount();

    vi.mocked(roomApi.getAmenities).mockRejectedValue(new Error('boom'));
    renderAt();
    await screen.findByRole('link', { name: 'Xem chi tiết Focus Room Creative' });
    await waitFor(() => expect(roomApi.getAmenities).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole('heading', { name: 'Tiện ích trong từng không gian.' }),
    ).not.toBeInTheDocument();
  });

  it('describes the real booking steps and offers account creation to guests', async () => {
    renderAt();
    expect(screen.getByRole('heading', { name: 'Đặt chỗ trong bốn bước.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nhận mã đặt phòng' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo tài khoản' })).toHaveAttribute(
      'href',
      '/register',
    );
    await screen.findByRole('link', { name: 'Xem chi tiết Focus Room Creative' });
  });

  it('redirects legacy explorer links to /rooms keeping the query', async () => {
    renderAt('/?capacity=4&page=2');
    expect(await screen.findByText('Rooms explorer')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/rooms?capacity=4&page=2');
    expect(roomApi.getRooms).not.toHaveBeenCalled();
  });
});
