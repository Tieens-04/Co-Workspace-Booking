import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminClosuresPage } from '../pages/AdminClosuresPage';
import { adminClosureApi } from '../services/admin-closure.api';
import { roomApi } from '../services/room.api';
import { ClosureItem } from '../types/closure';
import { RoomListItem } from '../types/room';

vi.mock('../services/admin-closure.api', () => ({
  adminClosureApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../services/room.api', () => ({
  roomApi: {
    getRooms: vi.fn(),
  },
}));

const mockRoom1: RoomListItem = {
  id: 'room-1',
  name: 'Phòng Hội Thảo A',
  capacity: 20,
  pricePerHour: '200000',
  status: 'AVAILABLE',
  coverImage: null,
  amenities: [],
};

const mockClosureFacility: ClosureItem = {
  id: 'closure-1',
  roomId: null,
  room: null,
  startTime: '2026-12-25T01:00:00.000Z', // 08:00 VN
  endTime: '2026-12-25T11:00:00.000Z', // 18:00 VN
  reason: 'Nghỉ Lễ Giáng Sinh',
  createdById: 'user-admin',
  createdBy: {
    id: 'user-admin',
    fullName: 'Admin User',
    email: 'admin@cospace.vn',
  },
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const mockClosureRoom: ClosureItem = {
  id: 'closure-2',
  roomId: 'room-1',
  room: { id: 'room-1', name: 'Phòng Hội Thảo A' },
  startTime: '2026-12-26T02:00:00.000Z',
  endTime: '2026-12-26T06:00:00.000Z',
  reason: 'Bảo trì máy lạnh',
  createdById: 'user-admin',
  createdBy: {
    id: 'user-admin',
    fullName: 'Admin User',
    email: 'admin@cospace.vn',
  },
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const okResponse = <T,>(data: T) => ({
  success: true as const,
  message: 'Thành công',
  data,
});

describe('AdminClosuresPage (CWB-86)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(roomApi.getRooms).mockResolvedValue(
      okResponse({
        items: [mockRoom1],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      }),
    );
    vi.mocked(adminClosureApi.list).mockResolvedValue(
      okResponse({
        items: [mockClosureFacility, mockClosureRoom],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    );
  });

  it('renders closures table with facility-wide and room-specific closures', async () => {
    render(<AdminClosuresPage />);

    expect(await screen.findByTestId('closure-row-closure-1')).toBeInTheDocument();
    expect(screen.getByTestId('closure-row-closure-2')).toBeInTheDocument();

    expect(screen.getByText('Toàn cơ sở')).toBeInTheDocument();
    expect(screen.getByText('Phòng Hội Thảo A')).toBeInTheDocument();
    expect(screen.getByText('Nghỉ Lễ Giáng Sinh')).toBeInTheDocument();
    expect(screen.getByText('Bảo trì máy lạnh')).toBeInTheDocument();
  });

  it('shows empty state when no closures exist', async () => {
    vi.mocked(adminClosureApi.list).mockResolvedValue(
      okResponse({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }),
    );

    render(<AdminClosuresPage />);

    expect(await screen.findByText('Chưa có khung đóng cửa nào')).toBeInTheDocument();
  });

  it('filters closures by room and upcoming toggle', async () => {
    const user = userEvent.setup();
    render(<AdminClosuresPage />);

    await screen.findByTestId('closure-row-closure-1');

    // Filter by room
    const select = screen.getByTestId('filter-room-select');
    await user.selectOptions(select, 'room-1');

    await waitFor(() => {
      expect(adminClosureApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ roomId: 'room-1' }),
        expect.anything(),
      );
    });

    // Check upcoming checkbox
    const checkbox = screen.getByTestId('filter-upcoming-checkbox');
    await user.click(checkbox);

    await waitFor(() => {
      expect(adminClosureApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ roomId: 'room-1', upcoming: true }),
        expect.anything(),
      );
    });
  });

  it('validates form inputs before submitting', async () => {
    const user = userEvent.setup();
    render(<AdminClosuresPage />);

    await screen.findByTestId('closure-row-closure-1');

    // Open create modal
    await user.click(screen.getByTestId('btn-add-closure'));
    expect(screen.getByText('Thêm khung đóng cửa mới')).toBeInTheDocument();

    // Select room scope without choosing room
    await user.selectOptions(screen.getByTestId('closure-scope-select'), 'ROOM');
    await user.click(screen.getByTestId('btn-submit-closure'));

    expect(screen.getByTestId('closure-form-error')).toHaveTextContent(
      'Vui lòng chọn phòng cần đóng cửa.',
    );

    // Pick room but clear reason
    await user.selectOptions(screen.getByTestId('closure-room-select'), 'room-1');
    await user.click(screen.getByTestId('btn-submit-closure'));

    expect(screen.getByTestId('closure-form-error')).toHaveTextContent(
      'Lý do đóng cửa không được để trống.',
    );
  });

  it('creates a facility-wide closure successfully', async () => {
    const user = userEvent.setup();
    vi.mocked(adminClosureApi.create).mockResolvedValue(okResponse(mockClosureFacility));

    render(<AdminClosuresPage />);
    await screen.findByTestId('closure-row-closure-1');

    await user.click(screen.getByTestId('btn-add-closure'));
    await user.type(screen.getByTestId('closure-reason'), 'Nghỉ Tết Nguyên Đán');
    await user.click(screen.getByTestId('btn-submit-closure'));

    await waitFor(() => {
      expect(adminClosureApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: null,
          reason: 'Nghỉ Tết Nguyên Đán',
          acknowledgeConflictingBookings: false,
        }),
      );
    });
  });

  it('handles 409 conflicting bookings and allows acknowledgment', async () => {
    const user = userEvent.setup();
    const conflictError = {
      response: {
        status: 409,
        data: {
          code: 'CLOSURE_HAS_CONFLICTING_BOOKINGS',
          message: 'Khung đóng cửa trùng với các lượt đặt phòng đã xác nhận',
          details: {
            conflictingBookingCount: 1,
            bookings: [
              {
                bookingCode: 'CS-20261225-TEST',
                roomId: 'room-1',
                roomName: 'Phòng Hội Thảo A',
                startTime: '2026-12-25T02:00:00.000Z',
                endTime: '2026-12-25T04:00:00.000Z',
                guestName: 'Nguyễn Văn A',
                userEmail: 'vana@example.com',
              },
            ],
          },
        },
      },
    };

    vi.mocked(adminClosureApi.create).mockRejectedValueOnce(conflictError);
    vi.mocked(adminClosureApi.create).mockResolvedValueOnce(okResponse(mockClosureFacility));

    render(<AdminClosuresPage />);
    await screen.findByTestId('closure-row-closure-1');

    await user.click(screen.getByTestId('btn-add-closure'));
    await user.type(screen.getByTestId('closure-reason'), 'Bảo trì tòa nhà');
    await user.click(screen.getByTestId('btn-submit-closure'));

    // Conflict modal should appear
    expect(await screen.findByText('Cảnh báo xung đột đặt phòng')).toBeInTheDocument();
    expect(screen.getByText('CS-20261225-TEST')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();

    // Confirm despite conflict
    await user.click(screen.getByTestId('btn-confirm-conflict-closure'));

    await waitFor(() => {
      expect(adminClosureApi.create).toHaveBeenCalledTimes(2);
      expect(adminClosureApi.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          acknowledgeConflictingBookings: true,
        }),
      );
    });
  });

  it('deletes a closure through confirmation dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(adminClosureApi.delete).mockResolvedValue(okResponse(mockClosureFacility));

    render(<AdminClosuresPage />);
    await screen.findByTestId('closure-row-closure-1');

    // Click delete on row 1
    await user.click(screen.getByTestId('btn-delete-closure-closure-1'));
    expect(screen.getByText('Xác nhận xóa khung đóng cửa')).toBeInTheDocument();

    await user.click(screen.getByTestId('btn-confirm-delete-closure'));

    await waitFor(() => {
      expect(adminClosureApi.delete).toHaveBeenCalledWith('closure-1');
    });
  });

  it('includes fallback option for editingClosure.room when room is not in initial rooms list', async () => {
    const user = userEvent.setup();
    const closureWithUnlistedRoom: ClosureItem = {
      ...mockClosureRoom,
      id: 'closure-unlisted',
      roomId: 'room-999',
      room: { id: 'room-999', name: 'Phòng VIP 999' },
    };
    vi.mocked(adminClosureApi.list).mockResolvedValue(
      okResponse({
        items: [closureWithUnlistedRoom],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    );

    render(<AdminClosuresPage />);
    await screen.findByTestId('closure-row-closure-unlisted');

    await user.click(screen.getByTestId('btn-edit-closure-closure-unlisted'));
    const roomSelect = screen.getByTestId('closure-room-select') as HTMLSelectElement;
    expect(roomSelect.value).toBe('room-999');
    expect(screen.getByRole('option', { name: 'Phòng VIP 999' })).toBeInTheDocument();
  });
});
