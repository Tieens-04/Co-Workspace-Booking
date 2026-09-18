import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { HomePage } from '../pages/HomePage';
import { AuthProvider } from '../context/AuthContext';
import { roomApi } from '../services/room.api';
import { RoomListItem, Amenity, ApiResponse, GetRoomsResponseData } from '../types/room';

vi.mock('../services/room.api', () => ({
  roomApi: {
    getRooms: vi.fn(),
    getRoomById: vi.fn(),
    getAmenities: vi.fn(),
  },
}));

const mockAmenitiesData: Amenity[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'High-Speed Wi-Fi',
    icon: 'wifi',
    description: 'Internet tốc độ cao',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Free Coffee',
    icon: 'coffee',
    description: 'Cà phê miễn phí',
  },
];

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
};

const HistoryControls = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      History back
    </button>
  );
};

const mockRoomsData: RoomListItem[] = [
  {
    id: 'room-1',
    name: 'Focus Room Creative',
    capacity: 4,
    pricePerHour: '180000.00',
    status: 'AVAILABLE',
    coverImage: 'https://images.example.com/room1.jpg',
    amenities: [mockAmenitiesData[0]],
  },
  {
    id: 'room-2',
    name: 'Meeting Room Grand',
    capacity: 12,
    pricePerHour: '450000.00',
    status: 'MAINTENANCE',
    coverImage: null,
    amenities: [mockAmenitiesData[0], mockAmenitiesData[1]],
  },
];

const mockRoomsResponse = (
  items: RoomListItem[] = mockRoomsData,
  total = 2,
  totalPages = 1,
  page = 1,
): ApiResponse<GetRoomsResponseData> => ({
  success: true,
  message: 'Thành công',
  data: {
    items,
    pagination: {
      page,
      limit: 10,
      total,
      totalPages,
    },
  },
});

describe('Room Discovery - HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(roomApi.getAmenities).mockResolvedValue({
      success: true,
      message: 'OK',
      data: mockAmenitiesData,
    });
    vi.mocked(roomApi.getRooms).mockResolvedValue(mockRoomsResponse());
  });

  const renderComponent = (initialEntry = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <HomePage />
                  <LocationProbe />
                </>
              }
            />
            <Route path="/rooms/:id" element={<div>Room Detail Mock</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  };

  it('renders room list with formatted VND price, capacity, and status badges', async () => {
    renderComponent();

    expect(await screen.findByText('Focus Room Creative')).toBeInTheDocument();
    expect(screen.getByText('180.000 đ/giờ')).toBeInTheDocument();
    expect(screen.getByText('👥 4 người')).toBeInTheDocument();
    expect(screen.getByText('Sẵn sàng')).toBeInTheDocument();

    expect(screen.getByText('Meeting Room Grand')).toBeInTheDocument();
    expect(screen.getByText('450.000 đ/giờ')).toBeInTheDocument();
    expect(screen.getByText('👥 12 người')).toBeInTheDocument();
    expect(screen.getByText('Bảo trì')).toBeInTheDocument();
  });

  it('handles image error and falls back to placeholder SVG', async () => {
    renderComponent();

    const img = (await screen.findByAltText('Focus Room Creative')) as HTMLImageElement;
    expect(img.src).toBe('https://images.example.com/room1.jpg');

    fireEvent.error(img);

    await waitFor(() => {
      expect(img.src).toContain('data:image/svg+xml');
    });
  });

  it('displays empty state with clear filters button when no rooms match', async () => {
    vi.mocked(roomApi.getRooms).mockResolvedValueOnce(mockRoomsResponse([], 0, 0, 1));

    renderComponent('/?capacity=50');

    expect(await screen.findByText('Không tìm thấy phòng phù hợp')).toBeInTheDocument();
    const clearBtn = screen.getByRole('button', { name: /Xóa bộ lọc/i });
    expect(clearBtn).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(clearBtn);

    await waitFor(() => {
      expect(roomApi.getRooms).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10 }),
        expect.any(AbortSignal),
      );
    });
  });

  it('displays error state and retries fetching when roomApi fails', async () => {
    vi.mocked(roomApi.getRooms).mockRejectedValueOnce(new Error('Mạng bị ngắt kết nối'));

    renderComponent();

    expect(await screen.findByText('Không thể tải danh sách phòng')).toBeInTheDocument();
    expect(screen.getByText('Mạng bị ngắt kết nối')).toBeInTheDocument();

    vi.mocked(roomApi.getRooms).mockResolvedValueOnce(mockRoomsResponse());
    const retryBtn = screen.getByRole('button', { name: /Thử lại/i });
    const user = userEvent.setup();
    await user.click(retryBtn);

    expect(await screen.findByText('Focus Room Creative')).toBeInTheDocument();
  });

  it('loads amenities independently; errors in amenities do not block room listing', async () => {
    vi.mocked(roomApi.getAmenities).mockRejectedValueOnce(new Error('Lỗi tải tiện ích'));

    renderComponent();

    // Rooms still render successfully
    expect(await screen.findByText('Focus Room Creative')).toBeInTheDocument();

    // Amenities error is shown with retry button
    expect(await screen.findByText(/Lỗi tải tiện ích/i)).toBeInTheDocument();

    vi.mocked(roomApi.getAmenities).mockResolvedValueOnce({
      success: true,
      message: 'OK',
      data: mockAmenitiesData,
    });

    const user = userEvent.setup();
    const retryAmenitiesBtn = screen.getByRole('button', { name: /Thử lại/i });
    await user.click(retryAmenitiesBtn);

    expect(await screen.findByRole('checkbox', { name: /High-Speed Wi-Fi/i })).toBeInTheDocument();
  });

  it('validates client-side inputs and blocks request for invalid values', async () => {
    renderComponent();
    await screen.findByText('Focus Room Creative');

    const user = userEvent.setup();
    const capacityInput = screen.getByLabelText(/Sức chứa tối thiểu/i);
    const minPriceInput = screen.getByPlaceholderText('Từ...');
    const maxPriceInput = screen.getByPlaceholderText('Đến...');
    const callsBeforeInvalidInput = vi.mocked(roomApi.getRooms).mock.calls.length;

    // Invalid capacity (non-positive)
    await user.type(capacityInput, '0');
    expect(await screen.findByText('Sức chứa phải là số nguyên dương')).toBeInTheDocument();

    await user.clear(capacityInput);

    // Invalid price with >2 decimal places
    await user.type(minPriceInput, '100.123');
    expect(
      await screen.findByText('Giá tối thiểu không hợp lệ (tối đa 2 số thập phân)'),
    ).toBeInTheDocument();

    await user.clear(minPriceInput);

    // minPrice > maxPrice
    await user.type(minPriceInput, '500');
    await user.type(maxPriceInput, '200');
    expect(
      await screen.findByText('Giá tối thiểu không được lớn hơn giá tối đa'),
    ).toBeInTheDocument();

    await user.clear(minPriceInput);
    await user.clear(maxPriceInput);
    await user.type(capacityInput, '2147483648');
    expect(await screen.findByText('Sức chứa vượt quá giới hạn cho phép')).toBeInTheDocument();

    await user.clear(capacityInput);
    await user.type(minPriceInput, '100000000.00');
    expect(await screen.findByText('Giá tối thiểu vượt quá giới hạn cho phép')).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(roomApi.getRooms).toHaveBeenCalledTimes(callsBeforeInvalidInput);
  });

  it('waits for debounce before requesting rooms with the committed capacity', async () => {
    renderComponent();
    await screen.findByText('Focus Room Creative');

    const user = userEvent.setup();
    const capacityInput = screen.getByLabelText(/Sức chứa tối thiểu/i);
    const callsBeforeTyping = vi.mocked(roomApi.getRooms).mock.calls.length;

    await user.type(capacityInput, '8');
    expect(roomApi.getRooms).toHaveBeenCalledTimes(callsBeforeTyping);

    await waitFor(
      () => {
        expect(roomApi.getRooms).toHaveBeenCalledWith(
          expect.objectContaining({ capacity: 8 }),
          expect.any(AbortSignal),
        );
      },
      { timeout: 1500 },
    );
    expect(roomApi.getRooms).toHaveBeenCalledTimes(callsBeforeTyping + 1);
  });

  it('toggles amenity checkbox immediately and resets page', async () => {
    renderComponent('/?page=2');
    await screen.findByText('Focus Room Creative');

    const wifiCheckbox = await screen.findByRole('checkbox', { name: /High-Speed Wi-Fi/i });
    expect(wifiCheckbox).not.toBeChecked();

    const user = userEvent.setup();
    await user.click(wifiCheckbox);

    await waitFor(() => {
      expect(roomApi.getRooms).toHaveBeenCalledWith(
        expect.objectContaining({
          amenityIds: '11111111-1111-4111-8111-111111111111',
          page: 1,
        }),
        expect.any(AbortSignal),
      );
    });
  });

  it('restores numeric filters on browser back without writing the newer value back', async () => {
    render(
      <MemoryRouter initialEntries={['/?capacity=4', '/?capacity=8']} initialIndex={1}>
        <AuthProvider>
          <HistoryControls />
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <HomePage />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await screen.findByText('Focus Room Creative');
    expect(screen.getByLabelText(/Sức chứa tối thiểu/i)).toHaveValue(8);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'History back' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('?capacity=4');
      expect(screen.getByLabelText(/Sức chứa tối thiểu/i)).toHaveValue(4);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(screen.getByTestId('location-search')).toHaveTextContent('?capacity=4');
    expect(vi.mocked(roomApi.getRooms).mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ capacity: 4 }),
    );
  });

  it('normalizes invalid shared-link filters before requesting rooms', async () => {
    renderComponent(
      '/?page=abc&capacity=2147483648&minPrice=100000000.00&amenityIds=invalid,11111111-1111-4111-8111-111111111111,11111111-1111-4111-8111-111111111111',
    );

    await screen.findByText('Focus Room Creative');

    expect(roomApi.getRooms).toHaveBeenCalledWith(
      {
        page: 1,
        limit: 10,
        amenityIds: '11111111-1111-4111-8111-111111111111',
      },
      expect.any(AbortSignal),
    );
    expect(screen.getByTestId('location-search')).toHaveTextContent(
      '?amenityIds=11111111-1111-4111-8111-111111111111',
    );
    expect(screen.getByLabelText(/Sức chứa tối thiểu/i)).toHaveValue(null);
    expect(screen.getByPlaceholderText('Từ...')).toHaveValue('');
  });

  it('handles pagination navigation and bounds', async () => {
    vi.mocked(roomApi.getRooms).mockResolvedValue(mockRoomsResponse(mockRoomsData, 25, 3, 1));

    renderComponent();

    expect(await screen.findByText('Focus Room Creative')).toBeInTheDocument();
    expect(screen.getByLabelText('Điều hướng phân trang')).toHaveTextContent('Trang 1 / 3');

    const prevBtn = screen.getByRole('button', { name: /Trang trước/i });
    const nextBtn = screen.getByRole('button', { name: /Trang sau/i });

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    const user = userEvent.setup();
    await user.click(nextBtn);

    await waitFor(() => {
      expect(roomApi.getRooms).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal),
      );
    });
  });
});
