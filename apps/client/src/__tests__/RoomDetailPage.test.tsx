import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoomDetailPage } from '../pages/RoomDetailPage';
import { AuthProvider } from '../context/AuthContext';
import { roomApi } from '../services/room.api';
import { RoomDetail, ApiResponse } from '../types/room';

vi.mock('../services/room.api', () => ({
  roomApi: {
    getRooms: vi.fn(),
    getRoomById: vi.fn(),
    getAmenities: vi.fn(),
    getAvailability: vi.fn(),
  },
}));

const mockRoomDetailData: RoomDetail = {
  id: 'room-101',
  name: 'Deluxe Meeting Space',
  description: 'A premium space with natural light and ergonomic chairs.',
  capacity: 8,
  pricePerHour: '250000.00',
  status: 'AVAILABLE',
  images: [
    {
      id: 'img-1',
      imageUrl: 'https://images.example.com/primary.jpg',
      isPrimary: true,
    },
    {
      id: 'img-2',
      imageUrl: 'https://images.example.com/secondary.jpg',
      isPrimary: false,
    },
  ],
  amenities: [
    {
      id: 'amenity-wifi',
      name: 'Wi-Fi 6',
      icon: 'wifi',
      description: 'Ultra-fast fiber optic',
    },
    {
      id: 'amenity-monitor',
      name: '4K Display',
      icon: 'monitor',
      description: 'Dell 65-inch 4K',
    },
  ],
};

const mockRoomResponse = (room: RoomDetail = mockRoomDetailData): ApiResponse<RoomDetail> => ({
  success: true,
  message: 'Lấy thông tin chi tiết phòng thành công',
  data: room,
});

const mockAvailabilityResponse = (
  date = '2026-10-25',
  roomId = 'room-101',
): ApiResponse<any> => ({
  success: true,
  message: 'Lấy thông tin lịch trống của phòng thành công',
  data: {
    roomId,
    date,
    timezone: 'Asia/Ho_Chi_Minh',
    slots: Array.from({ length: 48 }, (_, i) => {
      const dayStart = new Date(`${date}T00:00:00.000+07:00`);
      const slotStart = new Date(dayStart.getTime() + i * 30 * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
      return {
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        status: 'AVAILABLE' as const,
      };
    }),
  },
});

describe('RoomDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(roomApi.getRoomById).mockResolvedValue(mockRoomResponse());
    vi.mocked(roomApi.getAvailability).mockImplementation(async (_id, date) =>
      mockAvailabilityResponse(date),
    );
  });

  const renderComponent = (
    initialEntries: (string | { pathname: string; state?: Record<string, unknown> })[] = [
      '/rooms/room-101',
    ],
  ) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <Routes>
            <Route path="/rooms/:id" element={<RoomDetailPage />} />
            <Route path="/" element={<div>Discovery List Page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  };

  it('renders room details, gallery, pricing, capacity, and amenities', async () => {
    renderComponent();

    expect(await screen.findByText('Deluxe Meeting Space')).toBeInTheDocument();
    expect(screen.getByText('250.000 đ/giờ')).toBeInTheDocument();
    expect(screen.getByText('8 người')).toBeInTheDocument();
    expect(screen.getByText('Sẵn sàng')).toBeInTheDocument();
    expect(
      screen.getByText('A premium space with natural light and ergonomic chairs.'),
    ).toBeInTheDocument();

    // Check amenities
    expect(screen.getByText('Wi-Fi 6')).toBeInTheDocument();
    expect(screen.getByText('Ultra-fast fiber optic')).toBeInTheDocument();
    expect(screen.getByText('4K Display')).toBeInTheDocument();
  });

  it('allows clicking thumbnails to switch main displayed image', async () => {
    renderComponent();

    const mainImg = (await screen.findByAltText(
      'Deluxe Meeting Space - Ảnh 1',
    )) as HTMLImageElement;
    expect(mainImg.src).toBe('https://images.example.com/primary.jpg');

    const thumb2 = screen.getByRole('button', { name: /Xem ảnh 2/i });
    const user = userEvent.setup();
    await user.click(thumb2);

    expect(screen.getByAltText('Deluxe Meeting Space - Ảnh 2')).toHaveAttribute(
      'src',
      'https://images.example.com/secondary.jpg',
    );
  });

  it('handles image error by showing SVG placeholder', async () => {
    renderComponent();

    const mainImg = (await screen.findByAltText(
      'Deluxe Meeting Space - Ảnh 1',
    )) as HTMLImageElement;

    fireEvent.error(mainImg);

    await waitFor(() => {
      expect(mainImg.src).toContain('data:image/svg+xml');
    });
  });

  it('handles room without images or description gracefully', async () => {
    const emptyRoom: RoomDetail = {
      ...mockRoomDetailData,
      images: [],
      description: null,
      amenities: [],
    };
    vi.mocked(roomApi.getRoomById).mockResolvedValueOnce(mockRoomResponse(emptyRoom));

    renderComponent();

    expect(await screen.findByText('Deluxe Meeting Space')).toBeInTheDocument();
    expect(screen.getByText('Chưa có mô tả chi tiết cho phòng này.')).toBeInTheDocument();
    expect(
      screen.getByText('Phòng này hiện chưa có danh sách tiện ích bổ sung.'),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Deluxe Meeting Space - Chưa có ảnh')).toBeInTheDocument();
  });

  it('displays 404 ROOM_NOT_FOUND error screen when room does not exist', async () => {
    const error404 = {
      name: 'AxiosError',
      response: {
        status: 404,
        data: {
          code: 'ROOM_NOT_FOUND',
          message: 'Không tìm thấy phòng',
        },
      },
    };
    vi.mocked(roomApi.getRoomById).mockRejectedValueOnce(error404);

    renderComponent();

    expect(await screen.findByText('Không tìm thấy phòng')).toBeInTheDocument();
    expect(
      screen.getByText(/Phòng bạn đang tìm kiếm không tồn tại hoặc đã bị ngừng cung cấp dịch vụ./i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Quay về danh sách phòng/i })).toBeInTheDocument();
  });

  it('displays server error screen with retry button on unexpected network failure', async () => {
    vi.mocked(roomApi.getRoomById).mockRejectedValueOnce(new Error('Máy chủ quá tải'));

    renderComponent();

    expect(await screen.findByText('Lỗi kết nối')).toBeInTheDocument();
    expect(screen.getByText('Máy chủ quá tải')).toBeInTheDocument();

    vi.mocked(roomApi.getRoomById).mockResolvedValueOnce(mockRoomResponse());
    const retryBtn = screen.getByRole('button', { name: /Thử lại/i });
    const user = userEvent.setup();
    await user.click(retryBtn);

    expect(await screen.findByText('Deluxe Meeting Space')).toBeInTheDocument();
  });

  it('preserves search query in back link when redirected with state from list', async () => {
    renderComponent([
      {
        pathname: '/rooms/room-101',
        state: { from: '/?page=2&capacity=4&minPrice=100000' },
      },
    ]);

    expect(await screen.findByText('Deluxe Meeting Space')).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: /← Quay lại danh sách phòng/i });
    expect(backLink).toHaveAttribute('href', '/?page=2&capacity=4&minPrice=100000');
  });

  it('defaults back link to root / when accessed without state', async () => {
    renderComponent();

    expect(await screen.findByText('Deluxe Meeting Space')).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: /← Quay lại danh sách phòng/i });
    expect(backLink).toHaveAttribute('href', '/');
  });

  describe('Customer Booking Form Integration (AC2)', () => {
    const createMockJwt = (role: 'CUSTOMER' | 'ADMIN', sub = 'user-uuid-1') => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(
        JSON.stringify({
          sub,
          role,
          email: `${role.toLowerCase()}@example.com`,
          fullName: `Test ${role}`,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      );
      return `${header}.${payload}.signature`;
    };

    it('renders guest login prompt within booking section when unauthenticated', async () => {
      renderComponent();

      expect(await screen.findByText('Deluxe Meeting Space')).toBeInTheDocument();
      expect(screen.getByTestId('booking-guest-prompt')).toBeInTheDocument();
      expect(screen.getByTestId('booking-login-link')).toBeInTheDocument();
      expect(screen.queryByTestId('customer-booking-form')).not.toBeInTheDocument();
    });

    it('renders customer booking form when user is logged in as CUSTOMER and room is AVAILABLE', async () => {
      localStorage.setItem('cospace.accessToken', createMockJwt('CUSTOMER'));
      renderComponent();

      expect(await screen.findByText('Deluxe Meeting Space')).toBeInTheDocument();
      expect(screen.getByTestId('customer-booking-form')).toBeInTheDocument();
      expect(screen.getByTestId('booking-start-input')).toBeInTheDocument();
      expect(screen.getByTestId('booking-end-input')).toBeInTheDocument();
      expect(screen.getByTestId('booking-submit-btn')).toBeInTheDocument();
    });

    it('renders admin notice instead of booking form when user is logged in as ADMIN', async () => {
      localStorage.setItem('cospace.accessToken', createMockJwt('ADMIN'));
      renderComponent();

      expect(await screen.findByText('Deluxe Meeting Space')).toBeInTheDocument();
      expect(screen.getByTestId('booking-admin-notice')).toBeInTheDocument();
      expect(screen.queryByTestId('customer-booking-form')).not.toBeInTheDocument();
    });

    it('renders maintenance alert and disables booking when room status is MAINTENANCE', async () => {
      localStorage.setItem('cospace.accessToken', createMockJwt('CUSTOMER'));
      vi.mocked(roomApi.getRoomById).mockResolvedValueOnce(
        mockRoomResponse({
          ...mockRoomDetailData,
          status: 'MAINTENANCE',
        }),
      );

      renderComponent();

      expect(await screen.findByText('Deluxe Meeting Space')).toBeInTheDocument();
      expect(screen.getByTestId('booking-maintenance-box')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/Bảo trì/i);
      expect(screen.queryByTestId('customer-booking-form')).not.toBeInTheDocument();
    });
  });
});
