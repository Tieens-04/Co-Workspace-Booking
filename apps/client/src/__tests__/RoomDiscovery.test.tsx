import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { RoomsPage } from '../pages/RoomsPage';
import { PublicLayout } from '../layouts/PublicLayout';
import { AuthProvider } from '../context/AuthContext';
import { roomApi } from '../services/room.api';
import { RoomListItem, Amenity, ApiResponse, GetRoomsResponseData } from '../types/room';
import { TOKEN_STORAGE_KEY } from '../utils/token';
import { createMockJwt } from './test-utils';

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

const DetailStateProbe = () => {
  const location = useLocation();
  return (
    <div>
      Room Detail Mock
      <output data-testid="detail-from">{(location.state as { from?: string })?.from}</output>
    </div>
  );
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

describe('Room Discovery - RoomsPage (/rooms)', () => {
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

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderComponent = (initialEntry = '/rooms') => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route
                path="/rooms"
                element={
                  <>
                    <RoomsPage />
                    <LocationProbe />
                  </>
                }
              />
              <Route path="/rooms/:id" element={<DetailStateProbe />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  };

  it('renders room list with formatted VND price, capacity, and a badge only for maintenance', async () => {
    renderComponent();

    expect(await screen.findByText('Focus Room Creative')).toBeInTheDocument();
    expect(screen.getByText('180.000 đ/giờ')).toBeInTheDocument();
    expect(screen.getByText('4 người')).toBeInTheDocument();
    // The list never claims a room is free/ready: availability depends on the chosen date.
    expect(screen.queryByText('Sẵn sàng')).not.toBeInTheDocument();

    expect(screen.getByText('Meeting Room Grand')).toBeInTheDocument();
    expect(screen.getByText('450.000 đ/giờ')).toBeInTheDocument();
    expect(screen.getByText('12 người')).toBeInTheDocument();
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

    renderComponent('/rooms?capacity=50');

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

    // Deterministic debounce: from here the clock only moves when the test advances it. With real
    // timers a slow run could let the 300 ms debounce fire on a valid intermediate value (e.g.
    // min=500 before max is typed) and make a request: that was the flake. Values are entered with
    // fireEvent.change because user-event's async wrapper waits on a real setTimeout, which never
    // resolves under fully fake timers.
    vi.useFakeTimers();
    const setValue = (input: HTMLElement, value: string) =>
      fireEvent.change(input, { target: { value } });
    const passDebounce = () =>
      act(() => {
        vi.advanceTimersByTime(350);
      });

    const capacityInput = screen.getByLabelText(/Sức chứa tối thiểu/i);
    const minPriceInput = screen.getByPlaceholderText('Từ...');
    const maxPriceInput = screen.getByPlaceholderText('Đến...');
    const callsBeforeInvalidInput = vi.mocked(roomApi.getRooms).mock.calls.length;

    // Invalid capacity (non-positive)
    setValue(capacityInput, '0');
    expect(screen.getByText('Sức chứa phải là số nguyên dương')).toBeInTheDocument();
    passDebounce();
    expect(roomApi.getRooms).toHaveBeenCalledTimes(callsBeforeInvalidInput);

    setValue(capacityInput, '');

    // Invalid price with >2 decimal places
    setValue(minPriceInput, '100.123');
    expect(
      screen.getByText('Giá tối thiểu không hợp lệ (tối đa 2 số thập phân)'),
    ).toBeInTheDocument();
    passDebounce();
    expect(roomApi.getRooms).toHaveBeenCalledTimes(callsBeforeInvalidInput);

    setValue(minPriceInput, '');

    // minPrice > maxPrice
    setValue(minPriceInput, '500');
    setValue(maxPriceInput, '200');
    expect(screen.getByText('Giá tối thiểu không được lớn hơn giá tối đa')).toBeInTheDocument();
    passDebounce();
    expect(roomApi.getRooms).toHaveBeenCalledTimes(callsBeforeInvalidInput);

    setValue(minPriceInput, '');
    setValue(maxPriceInput, '');
    setValue(capacityInput, '2147483648');
    expect(screen.getByText('Sức chứa vượt quá giới hạn cho phép')).toBeInTheDocument();
    passDebounce();
    expect(roomApi.getRooms).toHaveBeenCalledTimes(callsBeforeInvalidInput);

    setValue(capacityInput, '');
    setValue(minPriceInput, '100000000.00');
    expect(screen.getByText('Giá tối thiểu vượt quá giới hạn cho phép')).toBeInTheDocument();

    passDebounce();
    expect(roomApi.getRooms).toHaveBeenCalledTimes(callsBeforeInvalidInput);

    // Control: the same fake clock does let a valid value through, so the checks above are real.
    setValue(minPriceInput, '100000');
    passDebounce();
    expect(roomApi.getRooms).toHaveBeenCalledTimes(callsBeforeInvalidInput + 1);
    expect(roomApi.getRooms).toHaveBeenLastCalledWith(
      expect.objectContaining({ minPrice: '100000', page: 1 }),
      expect.any(AbortSignal),
    );
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
    renderComponent('/rooms?page=2');
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
      <MemoryRouter initialEntries={['/rooms?capacity=4', '/rooms?capacity=8']} initialIndex={1}>
        <AuthProvider>
          <HistoryControls />
          <Routes>
            <Route
              path="/rooms"
              element={
                <>
                  <RoomsPage />
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
      '/rooms?page=abc&capacity=2147483648&minPrice=100000000.00&amenityIds=invalid,11111111-1111-4111-8111-111111111111,11111111-1111-4111-8111-111111111111',
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

  it('summarises active filters; a chip removes one filter and "Xóa bộ lọc" clears all', async () => {
    renderComponent('/rooms?capacity=4&amenityIds=11111111-1111-4111-8111-111111111111');
    await screen.findByText('Focus Room Creative');

    const summary = screen.getByRole('group', { name: 'Bộ lọc đang áp dụng' });
    const user = userEvent.setup();

    expect(
      await within(summary).findByRole('button', { name: 'Bỏ lọc: High-Speed Wi-Fi' }),
    ).toBeInTheDocument();
    await user.click(within(summary).getByRole('button', { name: 'Bỏ lọc: Từ 4 người' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        '?amenityIds=11111111-1111-4111-8111-111111111111',
      );
    });
    expect(screen.getByLabelText(/Sức chứa tối thiểu/i)).toHaveValue(null);

    await user.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent(/^$/);
    });
    expect(screen.queryByRole('group', { name: 'Bộ lọc đang áp dụng' })).not.toBeInTheDocument();
  });

  it('passes the current /rooms list URL to the detail page as the back-link target', async () => {
    renderComponent('/rooms?capacity=4');
    await screen.findByText('Focus Room Creative');

    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Xem chi tiết Focus Room Creative' }));

    expect(await screen.findByText('Room Detail Mock')).toBeInTheDocument();
    expect(screen.getByTestId('detail-from')).toHaveTextContent('/rooms?capacity=4');
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

  describe('Navigation links and roles', () => {
    it('shows "Lịch sử đặt phòng" link when logged in as CUSTOMER', async () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'c-1', role: 'CUSTOMER' }));
      vi.mocked(roomApi.getRooms).mockResolvedValue(mockRoomsResponse(mockRoomsData, 2, 1, 1));

      renderComponent();

      expect(await screen.findByRole('link', { name: /Lịch sử đặt phòng/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Lịch sử đặt phòng/i })).toHaveAttribute(
        'href',
        '/bookings',
      );
      expect(screen.queryByRole('link', { name: /Khu vực Quản trị/i })).not.toBeInTheDocument();
    });

    it('does not show "Lịch sử đặt phòng" link when logged in as ADMIN', async () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, createMockJwt({ sub: 'a-1', role: 'ADMIN' }));
      vi.mocked(roomApi.getRooms).mockResolvedValue(mockRoomsResponse(mockRoomsData, 2, 1, 1));

      renderComponent();

      expect(await screen.findByRole('link', { name: /Khu vực Quản trị/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Lịch sử đặt phòng/i })).not.toBeInTheDocument();
    });

    it('does not show "Lịch sử đặt phòng" link when not authenticated', async () => {
      localStorage.clear();
      vi.mocked(roomApi.getRooms).mockResolvedValue(mockRoomsResponse(mockRoomsData, 2, 1, 1));

      renderComponent();

      expect(await screen.findByRole('link', { name: /Đăng nhập/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Lịch sử đặt phòng/i })).not.toBeInTheDocument();
    });
  });
});
