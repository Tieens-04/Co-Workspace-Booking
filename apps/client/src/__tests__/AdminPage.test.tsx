import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '../pages/AdminPage';
import { roomApi } from '../services/room.api';
import { adminRoomApi } from '../services/admin-room.api';
import {
  RoomListItem,
  RoomDetail,
  Amenity,
  ApiResponse,
  GetRoomsResponseData,
} from '../types/room';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    principal: {
      id: 'admin-uuid-1',
      email: 'admin@cospace.com',
      fullName: 'System Admin',
      role: 'ADMIN',
    },
    logout: vi.fn(),
  }),
}));

vi.mock('../services/room.api', () => ({
  roomApi: {
    getAmenities: vi.fn(),
    getRoomById: vi.fn(),
    getRooms: vi.fn(),
  },
}));

vi.mock('../services/admin-room.api', () => ({
  adminRoomApi: {
    getAdminRooms: vi.fn(),
    createRoom: vi.fn(),
    updateRoom: vi.fn(),
  },
}));

const mockAmenities: Amenity[] = [
  {
    id: 'amenity-uuid-1',
    name: 'Wi-Fi 6 Tốc độ cao',
    icon: 'wifi',
    description: 'Internet nhanh',
  },
  {
    id: 'amenity-uuid-2',
    name: 'Máy chiếu 4K',
    icon: 'projector',
    description: 'Máy chiếu sắc nét',
  },
];

const mockRoomsList: RoomListItem[] = [
  {
    id: 'room-uuid-1',
    name: 'Phòng Họp Ban Giám Đốc',
    capacity: 10,
    pricePerHour: '250000.00',
    status: 'AVAILABLE',
    coverImage: 'https://images.example.com/cover1.jpg',
    amenities: [mockAmenities[0], mockAmenities[1]],
  },
  {
    id: 'room-uuid-2',
    name: 'Phòng Làm Việc Nhóm B',
    capacity: 6,
    pricePerHour: '120000.00',
    status: 'MAINTENANCE',
    coverImage: null,
    amenities: [mockAmenities[0]],
  },
];

const mockRoomDetail: RoomDetail = {
  id: 'room-uuid-1',
  name: 'Phòng Họp Ban Giám Đốc',
  description: 'Phòng họp tiêu chuẩn cao cấp',
  capacity: 10,
  pricePerHour: '250000.00',
  status: 'AVAILABLE',
  images: [
    {
      id: 'img-1',
      imageUrl: 'https://images.example.com/cover1.jpg',
      isPrimary: true,
    },
    {
      id: 'img-2',
      imageUrl: 'https://images.example.com/side1.jpg',
      isPrimary: false,
    },
  ],
  amenities: [mockAmenities[0], mockAmenities[1]],
};

const mockRoomsResponse = (
  items: RoomListItem[] = mockRoomsList,
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

describe('AdminPage - Room Management & Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(roomApi.getAmenities).mockResolvedValue({
      success: true,
      message: 'OK',
      data: mockAmenities,
    });
    vi.mocked(adminRoomApi.getAdminRooms).mockResolvedValue(mockRoomsResponse());
    vi.mocked(roomApi.getRoomById).mockResolvedValue({
      success: true,
      message: 'OK',
      data: mockRoomDetail,
    });
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    );
  };

  describe('Room List, Loading, Error, Empty & Pagination', () => {
    it('renders loading state and then displays room items', async () => {
      renderComponent();

      expect(screen.getByTestId('admin-loading-state')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });

      expect(screen.getByText('Phòng Làm Việc Nhóm B')).toBeInTheDocument();
      expect(screen.getByText('10 người')).toBeInTheDocument();
      expect(screen.getByText('6 người')).toBeInTheDocument();
      expect(screen.getByText('AVAILABLE')).toBeInTheDocument();
      expect(screen.getByText('MAINTENANCE')).toBeInTheDocument();
      expect(screen.getByText('250.000 đ/h')).toBeInTheDocument();
    });

    it('renders empty state when there are no rooms', async () => {
      vi.mocked(adminRoomApi.getAdminRooms).mockResolvedValueOnce(mockRoomsResponse([], 0, 0, 1));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('admin-empty-state')).toBeInTheDocument();
      });
      expect(screen.getByText('Chưa có phòng nào')).toBeInTheDocument();
    });

    it('renders error state and retries on button click', async () => {
      vi.mocked(adminRoomApi.getAdminRooms).mockRejectedValueOnce({
        response: { data: { message: 'Lỗi máy chủ khi tải danh sách' } },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Lỗi máy chủ khi tải danh sách')).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /thử lại/i });
      vi.mocked(adminRoomApi.getAdminRooms).mockResolvedValueOnce(mockRoomsResponse());

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });
    });

    it('renders pagination controls and navigates pages', async () => {
      vi.mocked(adminRoomApi.getAdminRooms).mockResolvedValueOnce(
        mockRoomsResponse(mockRoomsList, 25, 3, 1),
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
      });

      const nextBtn = screen.getByRole('button', { name: /trang sau/i });
      const prevBtn = screen.getByRole('button', { name: /trang trước/i });

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeEnabled();

      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(adminRoomApi.getAdminRooms).toHaveBeenCalledWith({
          page: 2,
          limit: 10,
        });
      });
    });

    it('shows an amenities error, blocks submit, and retries successfully', async () => {
      vi.mocked(roomApi.getAmenities).mockRejectedValueOnce({
        response: { data: { message: 'Không thể tải tiện ích' } },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('admin-add-room-btn'));

      expect(await screen.findByText('Không thể tải tiện ích')).toBeInTheDocument();
      expect(screen.getByTestId('admin-submit-room-btn')).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' }));

      await waitFor(() => {
        expect(screen.getByLabelText('Wi-Fi 6 Tốc độ cao')).toBeInTheDocument();
        expect(screen.getByTestId('admin-submit-room-btn')).toBeEnabled();
      });
    });
  });

  describe('Security & Scope Constraints (No Delete, No Status Controls in List)', () => {
    it('does NOT render any delete buttons or status toggles in room rows', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });

      // The list should only have "Sửa" buttons
      const editButtons = screen.getAllByRole('button', { name: 'Sửa' });
      expect(editButtons).toHaveLength(2);

      // Verify no Delete button exists in table
      const deleteButtons = screen.queryAllByRole('button', { name: /xóa phòng/i });
      expect(deleteButtons).toHaveLength(0);

      // Verify status cannot be toggled/edited from table (no select/dropdown for status)
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });

  describe('Create Room Flow & Image URL Rules', () => {
    it('opens the inline create form with default AVAILABLE notice and closes on cancel', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });

      const addBtn = screen.getByTestId('admin-add-room-btn');
      fireEvent.click(addBtn);

      const form = screen.getByTestId('admin-room-form');
      expect(within(form).getByRole('heading', { name: 'Thêm Phòng Mới' })).toBeInTheDocument();
      expect(within(form).getByText(/Trạng thái ban đầu:/i)).toBeInTheDocument();
      expect(within(form).getByText('AVAILABLE')).toBeInTheDocument();

      // Close form
      const cancelBtn = within(form).getByRole('button', { name: 'Hủy' });
      fireEvent.click(cancelBtn);

      expect(screen.queryByTestId('admin-room-form')).not.toBeInTheDocument();
    });

    it('enforces client validation for required fields', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('admin-add-room-btn'));

      const submitBtn = screen.getByTestId('admin-submit-room-btn');
      fireEvent.click(submitBtn);

      expect(screen.getByTestId('error-name')).toHaveTextContent('Tên phòng không được để trống');
      expect(screen.getByTestId('error-capacity')).toHaveTextContent(
        'Sức chứa phải là số nguyên dương',
      );
      expect(screen.getByTestId('error-pricePerHour')).toHaveTextContent(
        'Đơn giá phải là số tiền không âm với tối đa 2 chữ số thập phân',
      );

      expect(adminRoomApi.createRoom).not.toHaveBeenCalled();
    });

    it('manages dynamic image URLs: first image is auto-primary, removing primary promotes first remaining', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('admin-add-room-btn'));

      const addImageBtn = screen.getByTestId('admin-add-image-btn');

      // Add 1st image
      fireEvent.click(addImageBtn);
      const radio0 = screen.getByTestId('admin-primary-radio-0') as HTMLInputElement;
      expect(radio0.checked).toBe(true); // First image is auto-primary!

      // Add 2nd image
      fireEvent.click(addImageBtn);
      const radio1 = screen.getByTestId('admin-primary-radio-1') as HTMLInputElement;
      expect(radio1.checked).toBe(false);

      // Select 2nd image as primary
      fireEvent.click(radio1);
      expect((screen.getByTestId('admin-primary-radio-0') as HTMLInputElement).checked).toBe(false);
      expect((screen.getByTestId('admin-primary-radio-1') as HTMLInputElement).checked).toBe(true);

      // Delete 2nd image (which is currently primary) -> 1st image should automatically become primary
      const removeBtn1 = screen.getByTestId('admin-remove-image-1');
      fireEvent.click(removeBtn1);

      expect((screen.getByTestId('admin-primary-radio-0') as HTMLInputElement).checked).toBe(true);
    });

    it('submits valid create payload, closes the form, and refreshes list to page 1', async () => {
      const user = userEvent.setup();
      vi.mocked(adminRoomApi.createRoom).mockResolvedValueOnce({
        success: true,
        message: 'Tạo phòng thành công',
        data: mockRoomDetail,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('admin-add-room-btn'));

      await user.type(screen.getByLabelText(/Tên phòng/i), 'Phòng Thiết Kế Mới');
      await user.type(screen.getByLabelText(/Sức chứa/i), '12');
      await user.type(screen.getByLabelText(/Đơn giá mỗi giờ/i), '180000.00');

      // Toggle amenity
      const amenityCheckbox = screen.getByLabelText('Wi-Fi 6 Tốc độ cao');
      fireEvent.click(amenityCheckbox);

      // Add image
      fireEvent.click(screen.getByTestId('admin-add-image-btn'));
      await user.type(
        screen.getByTestId('admin-image-input-0'),
        'https://images.example.com/new.jpg',
      );

      // Submit
      fireEvent.click(screen.getByTestId('admin-submit-room-btn'));

      await waitFor(() => {
        expect(adminRoomApi.createRoom).toHaveBeenCalledWith({
          name: 'Phòng Thiết Kế Mới',
          description: null,
          capacity: 12,
          pricePerHour: '180000.00',
          amenityIds: ['amenity-uuid-1'],
          images: [{ imageUrl: 'https://images.example.com/new.jpg', isPrimary: true }],
        });
      });

      // Form should close and success banner show
      expect(screen.queryByTestId('admin-room-form')).not.toBeInTheDocument();
      expect(screen.getByText('Tạo phòng mới thành công!')).toBeInTheDocument();

      // Should reload rooms on page 1
      expect(adminRoomApi.getAdminRooms).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });
  });

  describe('Edit Room Flow (Preload, Read-Only Status & Partial Patch)', () => {
    it('ignores a stale edit response after the admin switches to create mode', async () => {
      let resolveDetail!: (value: ApiResponse<RoomDetail>) => void;
      const pendingDetail = new Promise<ApiResponse<RoomDetail>>((resolve) => {
        resolveDetail = resolve;
      });
      vi.mocked(roomApi.getRoomById).mockReturnValueOnce(pendingDetail);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('admin-edit-btn-room-uuid-1'));
      fireEvent.click(screen.getByTestId('admin-add-room-btn'));

      resolveDetail({ success: true, message: 'OK', data: mockRoomDetail });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Thêm Phòng Mới' })).toBeInTheDocument();
        expect((screen.getByLabelText(/Tên phòng/i) as HTMLInputElement).value).toBe('');
      });
    });

    it('preloads room details from roomApi.getRoomById and opens the edit form', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });

      const editBtn = screen.getByTestId('admin-edit-btn-room-uuid-1');
      fireEvent.click(editBtn);

      await waitFor(() => {
        expect(roomApi.getRoomById).toHaveBeenCalledWith('room-uuid-1', expect.any(AbortSignal));
        expect(screen.getByRole('heading', { name: 'Chỉnh Sửa Phòng' })).toBeInTheDocument();
      });

      // Verify preloaded values
      const nameInput = screen.getByLabelText(/Tên phòng/i) as HTMLInputElement;
      expect(nameInput.value).toBe('Phòng Họp Ban Giám Đốc');

      const descInput = screen.getByLabelText(/Mô tả phòng/i) as HTMLTextAreaElement;
      expect(descInput.value).toBe('Phòng họp tiêu chuẩn cao cấp');

      const capacityInput = screen.getByLabelText(/Sức chứa/i) as HTMLInputElement;
      expect(capacityInput.value).toBe('10');

      const priceInput = screen.getByLabelText(/Đơn giá mỗi giờ/i) as HTMLInputElement;
      expect(priceInput.value).toBe('250000.00');

      // Status is read-only notice
      expect(screen.getByText('Trạng thái phòng:')).toBeInTheDocument();
      expect(screen.getByText('(Chỉ xem - không thể thay đổi ở tác vụ này)')).toBeInTheDocument();

      // Preloaded images
      expect(screen.getByTestId('admin-image-row-0')).toBeInTheDocument();
      expect(screen.getByTestId('admin-image-row-1')).toBeInTheDocument();
      expect((screen.getByTestId('admin-primary-radio-0') as HTMLInputElement).checked).toBe(true);
      expect((screen.getByTestId('admin-primary-radio-1') as HTMLInputElement).checked).toBe(false);
    });

    it('submits edit changes, preserves current page, and displays success banner', async () => {
      const user = userEvent.setup();
      vi.mocked(adminRoomApi.updateRoom).mockResolvedValueOnce({
        success: true,
        message: 'Cập nhật thành công',
        data: mockRoomDetail,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('admin-edit-btn-room-uuid-1'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Chỉnh Sửa Phòng' })).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Tên phòng/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Phòng Ban Giám Đốc VIP');

      fireEvent.click(screen.getByTestId('admin-submit-room-btn'));

      await waitFor(() => {
        expect(adminRoomApi.updateRoom).toHaveBeenCalledWith(
          'room-uuid-1',
          expect.objectContaining({
            name: 'Phòng Ban Giám Đốc VIP',
          }),
        );
      });

      expect(screen.queryByTestId('admin-room-form')).not.toBeInTheDocument();
      expect(screen.getByText('Cập nhật thông tin phòng thành công!')).toBeInTheDocument();
    });
  });

  describe('Server Error Details Mapping', () => {
    it('maps server details[].field into field error messages', async () => {
      const user = userEvent.setup();
      vi.mocked(adminRoomApi.createRoom).mockRejectedValueOnce({
        response: {
          data: {
            message: 'Dữ liệu không hợp lệ',
            details: [
              { field: 'name', message: 'Tên phòng đã tồn tại' },
              { field: 'capacity', message: 'Sức chứa không hợp lệ' },
            ],
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Phòng Họp Ban Giám Đốc')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('admin-add-room-btn'));

      await user.type(screen.getByLabelText(/Tên phòng/i), 'Tên Trùng');
      await user.type(screen.getByLabelText(/Sức chứa/i), '5');
      await user.type(screen.getByLabelText(/Đơn giá mỗi giờ/i), '100000.00');

      fireEvent.click(screen.getByTestId('admin-submit-room-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('error-name')).toHaveTextContent('Tên phòng đã tồn tại');
        expect(screen.getByTestId('error-capacity')).toHaveTextContent('Sức chứa không hợp lệ');
        expect(screen.getByTestId('form-general-error')).toHaveTextContent('Dữ liệu không hợp lệ');
      });
    });
  });
});
