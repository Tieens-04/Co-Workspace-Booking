import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminClosuresPage } from '../pages/AdminClosuresPage';
import { adminClosureApi } from '../services/admin-closure.api';
import { adminRoomApi } from '../services/admin-room.api';
import { ClosureItem } from '../types/closure';
import { RoomListItem } from '../types/room';
import { formatVnDate, formatVnDateTimeLocal } from '../utils/bookingTime';

vi.mock('../services/admin-closure.api', () => ({
  adminClosureApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../services/admin-room.api', () => ({
  adminRoomApi: {
    getAdminRooms: vi.fn(),
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

const mockArchivedRoom: RoomListItem = {
  id: 'room-archived',
  name: 'Phòng Đã Lưu Trữ',
  capacity: 10,
  pricePerHour: '150000',
  status: 'ARCHIVED',
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
    vi.mocked(adminRoomApi.getAdminRooms).mockResolvedValue(
      okResponse({
        items: [mockRoom1, mockArchivedRoom],
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
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

    const facilityBadge = screen.getByText('Toàn cơ sở').closest('[data-slot="badge"]');
    expect(facilityBadge).toBeInTheDocument();
    expect(facilityBadge).toHaveClass(
      'bg-status-warning-bg',
      'border-status-warning-border',
      'text-status-warning',
    );
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

    // Select room scope without choosing room and leave reason blank
    await user.selectOptions(screen.getByTestId('closure-scope-select'), 'ROOM');
    await user.click(screen.getByTestId('btn-submit-closure'));

    const roomSelect = screen.getByTestId('closure-room-select');
    expect(screen.getByTestId('closure-room-id-error')).toHaveTextContent(
      'Vui lòng chọn phòng cần đóng cửa.',
    );
    expect(roomSelect).toHaveAttribute('aria-invalid', 'true');
    expect(roomSelect).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('closure-room-id-error'),
    );
    expect(screen.getByTestId('closure-reason-error')).toHaveTextContent(
      'Lý do đóng cửa không được để trống.',
    );
    expect(screen.getByTestId('closure-reason')).toHaveAttribute('aria-invalid', 'true');
    expect(adminClosureApi.create).not.toHaveBeenCalled();

    // Pick room -> clears room error, reason error remains until filled
    await user.selectOptions(roomSelect, 'room-1');
    await user.click(screen.getByTestId('btn-submit-closure'));

    expect(screen.queryByTestId('closure-room-id-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('closure-reason-error')).toHaveTextContent(
      'Lý do đóng cửa không được để trống.',
    );
    expect(adminClosureApi.create).not.toHaveBeenCalled();
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
    const conflictHeading = await screen.findByText('Cảnh báo xung đột đặt phòng');
    expect(conflictHeading).toBeInTheDocument();
    expect(conflictHeading.parentElement).toHaveClass('text-status-warning');
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

  it('uses adminRoomApi.getAdminRooms so ARCHIVED rooms appear in filter while disabled for new closures (CWB-120)', async () => {
    const user = userEvent.setup();
    render(<AdminClosuresPage />);

    await screen.findByTestId('closure-row-closure-1');
    expect(adminRoomApi.getAdminRooms).toHaveBeenCalledWith(
      { page: 1, limit: 100 },
      expect.any(AbortSignal),
    );

    const filterSelect = screen.getByTestId('filter-room-select');
    const archivedFilterOption = await screen.findByRole('option', {
      name: /Phòng Đã Lưu Trữ.*Ngừng kinh doanh/,
    });
    expect(archivedFilterOption).toBeInTheDocument();
    expect(archivedFilterOption).not.toBeDisabled();

    await user.selectOptions(filterSelect, 'room-archived');
    await waitFor(() => {
      expect(adminClosureApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ roomId: 'room-archived' }),
        expect.anything(),
      );
    });

    await user.click(screen.getByTestId('btn-add-closure'));
    await user.selectOptions(screen.getByTestId('closure-scope-select'), 'ROOM');
    const modalSelect = screen.getByTestId('closure-room-select');
    const modalArchivedOption = Array.from(modalSelect.querySelectorAll('option')).find(
      (opt) => opt.value === 'room-archived',
    );
    expect(modalArchivedOption).toBeDefined();
    expect(modalArchivedOption).toBeDisabled();
  });

  describe('CWB-96 closure time & slot validation', () => {
    it('configures 30-minute step (1800s) and :00-aligned min anchor on datetime inputs', async () => {
      const user = userEvent.setup();
      render(<AdminClosuresPage />);
      await screen.findByTestId('closure-row-closure-1');

      await user.click(screen.getByTestId('btn-add-closure'));

      const startInput = screen.getByTestId('closure-start-time');
      const endInput = screen.getByTestId('closure-end-time');
      expect(startInput).toHaveAttribute('step', '1800');
      expect(endInput).toHaveAttribute('step', '1800');
      expect(startInput).toHaveAttribute('min', '1970-01-01T00:00');
      expect(endInput).toHaveAttribute('min', '1970-01-01T00:00');
    });

    it('rejects off-slot manual times with field errors and ARIA wiring without calling API', async () => {
      const user = userEvent.setup();
      render(<AdminClosuresPage />);
      await screen.findByTestId('closure-row-closure-1');

      await user.click(screen.getByTestId('btn-add-closure'));
      const tomorrowStr = formatVnDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      const startInput = screen.getByTestId('closure-start-time');
      const endInput = screen.getByTestId('closure-end-time');

      fireEvent.change(startInput, { target: { value: `${tomorrowStr}T10:07` } });
      fireEvent.change(endInput, { target: { value: `${tomorrowStr}T11:13` } });
      await user.type(screen.getByTestId('closure-reason'), 'Bảo trì ngoài mốc');
      await user.click(screen.getByTestId('btn-submit-closure'));

      expect(screen.getByTestId('closure-start-time-error')).toHaveTextContent('30 phút');
      expect(screen.getByTestId('closure-end-time-error')).toHaveTextContent('30 phút');
      expect(startInput).toHaveAttribute('aria-invalid', 'true');
      expect(endInput).toHaveAttribute('aria-invalid', 'true');
      expect(startInput).toHaveAttribute(
        'aria-describedby',
        expect.stringContaining('closure-start-time-error'),
      );
      expect(endInput).toHaveAttribute(
        'aria-describedby',
        expect.stringContaining('closure-end-time-error'),
      );
      expect(adminClosureApi.create).not.toHaveBeenCalled();
    });

    it('rejects past endTime with field error and allows ongoing slot-aligned closure', async () => {
      const user = userEvent.setup();
      vi.mocked(adminClosureApi.create).mockResolvedValue(okResponse(mockClosureFacility));

      render(<AdminClosuresPage />);
      await screen.findByTestId('closure-row-closure-1');

      await user.click(screen.getByTestId('btn-add-closure'));
      const pastDate = formatVnDate(new Date(Date.now() - 48 * 60 * 60 * 1000));
      const startInput = screen.getByTestId('closure-start-time');
      const endInput = screen.getByTestId('closure-end-time');

      fireEvent.change(startInput, { target: { value: `${pastDate}T09:00` } });
      fireEvent.change(endInput, { target: { value: `${pastDate}T11:00` } });
      await user.type(screen.getByTestId('closure-reason'), 'Đóng cửa quá khứ');
      await user.click(screen.getByTestId('btn-submit-closure'));

      expect(screen.getByTestId('closure-end-time-error')).toHaveTextContent('tương lai');
      expect(endInput).toHaveAttribute('aria-invalid', 'true');
      expect(adminClosureApi.create).not.toHaveBeenCalled();

      // Fix to ongoing aligned window (now - 1h .. now + 2h rounded to 30m)
      const slotFloor = Math.floor(Date.now() / (30 * 60 * 1000)) * 30 * 60 * 1000;
      const ongoingStart = new Date(slotFloor - 60 * 60 * 1000);
      const ongoingEnd = new Date(slotFloor + 2 * 60 * 60 * 1000);
      fireEvent.change(startInput, { target: { value: formatVnDateTimeLocal(ongoingStart) } });
      fireEvent.change(endInput, { target: { value: formatVnDateTimeLocal(ongoingEnd) } });
      await user.click(screen.getByTestId('btn-submit-closure'));

      await waitFor(() => {
        expect(adminClosureApi.create).toHaveBeenCalledWith(
          expect.objectContaining({
            startTime: ongoingStart.toISOString(),
            endTime: ongoingEnd.toISOString(),
            reason: 'Đóng cửa quá khứ',
          }),
        );
      });
    });

    it('allows editing only reason on historical misaligned closure and sends minimal PATCH payload', async () => {
      const user = userEvent.setup();
      const historicalLegacyClosure: ClosureItem = {
        ...mockClosureRoom,
        id: 'closure-legacy-past',
        startTime: '2024-05-10T03:07:00.000Z', // 10:07 VN
        endTime: '2024-05-10T04:13:00.000Z', // 11:13 VN
        reason: 'Lý do cũ',
      };
      vi.mocked(adminClosureApi.list).mockResolvedValue(
        okResponse({
          items: [historicalLegacyClosure],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        }),
      );
      vi.mocked(adminClosureApi.update).mockResolvedValue(
        okResponse({ ...historicalLegacyClosure, reason: 'Lý do đã bổ sung' }),
      );

      render(<AdminClosuresPage />);
      await screen.findByTestId('closure-row-closure-legacy-past');

      await user.click(screen.getByTestId('btn-edit-closure-closure-legacy-past'));
      const reasonInput = screen.getByTestId('closure-reason');
      await user.clear(reasonInput);
      await user.type(reasonInput, 'Lý do đã bổ sung');
      await user.click(screen.getByTestId('btn-submit-closure'));

      await waitFor(() => {
        expect(adminClosureApi.update).toHaveBeenCalledWith('closure-legacy-past', {
          reason: 'Lý do đã bổ sung',
        });
      });
    });

    it('keeps minimal PATCH payload when confirming 409 conflicting bookings on partial edit', async () => {
      const user = userEvent.setup();
      const initialDay = formatVnDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
      const futureDay = formatVnDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      const editableClosure: ClosureItem = {
        ...mockClosureRoom,
        id: 'closure-2',
        startTime: new Date(`${initialDay}T08:00:00.000+07:00`).toISOString(),
        endTime: new Date(`${initialDay}T11:00:00.000+07:00`).toISOString(),
      };
      const expectedStart = new Date(`${futureDay}T09:30:00.000+07:00`).toISOString();
      const expectedEnd = new Date(`${futureDay}T12:00:00.000+07:00`).toISOString();
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
                  bookingCode: 'CS-20261226-CONF',
                  roomId: 'room-1',
                  roomName: 'Phòng Hội Thảo A',
                  startTime: expectedStart,
                  endTime: expectedEnd,
                  guestName: 'Khách B',
                  userEmail: null,
                },
              ],
            },
          },
        },
      };
      vi.mocked(adminClosureApi.list).mockResolvedValue(
        okResponse({
          items: [editableClosure],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        }),
      );
      vi.mocked(adminClosureApi.update).mockRejectedValueOnce(conflictError);
      vi.mocked(adminClosureApi.update).mockResolvedValueOnce(okResponse(editableClosure));

      render(<AdminClosuresPage />);
      await screen.findByTestId('closure-row-closure-2');

      await user.click(screen.getByTestId('btn-edit-closure-closure-2'));
      fireEvent.change(screen.getByTestId('closure-start-time'), {
        target: { value: `${futureDay}T09:30` },
      });
      fireEvent.change(screen.getByTestId('closure-end-time'), {
        target: { value: `${futureDay}T12:00` },
      });
      await user.click(screen.getByTestId('btn-submit-closure'));

      await screen.findByText('Cảnh báo xung đột đặt phòng');
      await user.click(screen.getByTestId('btn-confirm-conflict-closure'));

      await waitFor(() => {
        expect(adminClosureApi.update).toHaveBeenCalledTimes(2);
        expect(adminClosureApi.update).toHaveBeenNthCalledWith(1, 'closure-2', {
          startTime: expectedStart,
          endTime: expectedEnd,
          acknowledgeConflictingBookings: false,
        });
        expect(adminClosureApi.update).toHaveBeenNthCalledWith(2, 'closure-2', {
          startTime: expectedStart,
          endTime: expectedEnd,
          acknowledgeConflictingBookings: true,
        });
      });
    });

    it('maps server 400 CLOSURE_ENDED and VALIDATION_ERROR details onto field errors with ARIA wiring', async () => {
      const user = userEvent.setup();
      vi.mocked(adminClosureApi.create).mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            code: 'CLOSURE_ENDED',
            message: 'Thời gian kết thúc khung đóng cửa phải ở trong tương lai',
            details: [
              {
                field: 'endTime',
                message: 'Thời gian kết thúc khung đóng cửa phải ở trong tương lai',
              },
            ],
          },
        },
      });
      vi.mocked(adminClosureApi.create).mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            code: 'VALIDATION_ERROR',
            message: 'Dữ liệu đầu vào không hợp lệ',
            details: [
              { field: 'startTime', message: 'Lỗi mốc start từ server' },
              { field: 'endTime', message: 'Lỗi mốc end từ server' },
            ],
          },
        },
      });

      render(<AdminClosuresPage />);
      await screen.findByTestId('closure-row-closure-1');

      await user.click(screen.getByTestId('btn-add-closure'));
      await user.type(screen.getByTestId('closure-reason'), 'Test lỗi server');
      await user.click(screen.getByTestId('btn-submit-closure'));

      expect(await screen.findByTestId('closure-end-time-error')).toHaveTextContent(
        'Thời gian kết thúc khung đóng cửa phải ở trong tương lai',
      );
      expect(screen.getByTestId('closure-end-time')).toHaveAttribute('aria-invalid', 'true');

      await user.click(screen.getByTestId('btn-submit-closure'));
      expect(await screen.findByTestId('closure-start-time-error')).toHaveTextContent(
        'Lỗi mốc start từ server',
      );
      expect(screen.getByTestId('closure-end-time-error')).toHaveTextContent(
        'Lỗi mốc end từ server',
      );
      expect(screen.getByTestId('closure-start-time')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId('closure-end-time')).toHaveAttribute('aria-invalid', 'true');
    });

    it('allows saving edit when legacy closure has non-zero seconds on :00 minute and normalizes startTime in PATCH (R1-01)', async () => {
      const user = userEvent.setup();
      const futureDay = formatVnDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      const legacyStartWithSec = new Date(`${futureDay}T10:00:12.000+07:00`).toISOString();
      const normalizedStartIso = new Date(`${futureDay}T10:00:00.000+07:00`).toISOString();
      const initialEndIso = new Date(`${futureDay}T12:00:00.000+07:00`).toISOString();
      const updatedEndIso = new Date(`${futureDay}T13:00:00.000+07:00`).toISOString();
      const legacySecondsClosure: ClosureItem = {
        ...mockClosureRoom,
        id: 'closure-legacy-seconds',
        startTime: legacyStartWithSec,
        endTime: initialEndIso,
        reason: 'Bảo trì giây lẻ',
      };
      vi.mocked(adminClosureApi.list).mockResolvedValue(
        okResponse({
          items: [legacySecondsClosure],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        }),
      );
      vi.mocked(adminClosureApi.update).mockResolvedValue(
        okResponse({
          ...legacySecondsClosure,
          startTime: normalizedStartIso,
          endTime: updatedEndIso,
        }),
      );

      render(<AdminClosuresPage />);
      await screen.findByTestId('closure-row-closure-legacy-seconds');

      await user.click(screen.getByTestId('btn-edit-closure-closure-legacy-seconds'));
      fireEvent.change(screen.getByTestId('closure-end-time'), {
        target: { value: `${futureDay}T13:00` },
      });
      await user.click(screen.getByTestId('btn-submit-closure'));

      await waitFor(() => {
        expect(adminClosureApi.update).toHaveBeenCalledWith('closure-legacy-seconds', {
          startTime: normalizedStartIso,
          endTime: updatedEndIso,
          acknowledgeConflictingBookings: false,
        });
      });
      expect(screen.queryByTestId('closure-start-time-error')).not.toBeInTheDocument();
    });

    it('rejects manual datetime-local input with non-zero seconds using slot alignment message (R1-02)', async () => {
      const user = userEvent.setup();
      render(<AdminClosuresPage />);
      await screen.findByTestId('closure-row-closure-1');

      await user.click(screen.getByTestId('btn-add-closure'));
      const tomorrowStr = formatVnDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      fireEvent.change(screen.getByTestId('closure-start-time'), {
        target: { value: `${tomorrowStr}T10:00:15` },
      });
      await user.type(screen.getByTestId('closure-reason'), 'Kiểm tra giây khác 0');
      await user.click(screen.getByTestId('btn-submit-closure'));

      const startError = screen.getByTestId('closure-start-time-error');
      expect(startError).toHaveTextContent('30 phút');
      expect(startError).toHaveTextContent('giây bằng 0');
      expect(adminClosureApi.create).not.toHaveBeenCalled();
    });

    it('shows edit confirm label, closes 409 dialog on terminal 404, and clears stale errors on scope revert (R1-03)', async () => {
      const user = userEvent.setup();
      const historicalLegacyClosure: ClosureItem = {
        ...mockClosureRoom,
        id: 'closure-legacy-scope',
        startTime: '2024-05-10T03:07:00.000Z',
        endTime: '2024-05-10T04:13:00.000Z',
        reason: 'Lịch sử lệch mốc',
      };
      const futureDay = formatVnDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      const futureClosure: ClosureItem = {
        ...mockClosureRoom,
        id: 'closure-future-409',
        startTime: new Date(`${futureDay}T08:00:00.000+07:00`).toISOString(),
        endTime: new Date(`${futureDay}T11:00:00.000+07:00`).toISOString(),
        reason: 'Sửa xung đột',
      };
      vi.mocked(adminClosureApi.list).mockResolvedValue(
        okResponse({
          items: [historicalLegacyClosure, futureClosure],
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        }),
      );
      vi.mocked(adminClosureApi.update)
        .mockRejectedValueOnce({
          response: {
            status: 409,
            data: {
              code: 'CLOSURE_HAS_CONFLICTING_BOOKINGS',
              message: 'Khung đóng cửa trùng với các lượt đặt phòng đã xác nhận',
              details: {
                conflictingBookingCount: 1,
                bookings: [
                  {
                    bookingCode: 'CS-20261226-ERR',
                    roomId: 'room-1',
                    roomName: 'Phòng Hội Thảo A',
                    startTime: futureClosure.startTime,
                    endTime: futureClosure.endTime,
                    guestName: 'Khách C',
                    userEmail: null,
                  },
                ],
              },
            },
          },
        })
        .mockRejectedValueOnce({
          response: {
            status: 404,
            data: {
              code: 'CLOSURE_NOT_FOUND',
              message: 'Không tìm thấy khung đóng cửa',
            },
          },
        });

      render(<AdminClosuresPage />);
      await screen.findByTestId('closure-row-closure-legacy-scope');

      // 1. Scope change on historical misaligned closure blocks, and reverting scope clears stale errors
      await user.click(screen.getByTestId('btn-edit-closure-closure-legacy-scope'));
      await user.selectOptions(screen.getByTestId('closure-scope-select'), 'FACILITY');
      await user.click(screen.getByTestId('btn-submit-closure'));

      expect(screen.getByTestId('closure-start-time-error')).toHaveTextContent('30 phút');
      expect(screen.getByTestId('closure-end-time-error')).toHaveTextContent('30 phút');
      expect(adminClosureApi.update).not.toHaveBeenCalled();

      await user.selectOptions(screen.getByTestId('closure-scope-select'), 'ROOM');
      expect(screen.queryByTestId('closure-start-time-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('closure-end-time-error')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Hủy bỏ' }));

      // 2. Edit-mode 409 confirm label + closing AlertDialog on non-field 404
      await user.click(screen.getByTestId('btn-edit-closure-closure-future-409'));
      fireEvent.change(screen.getByTestId('closure-end-time'), {
        target: { value: `${futureDay}T12:00` },
      });
      await user.click(screen.getByTestId('btn-submit-closure'));

      const confirmBtn = await screen.findByTestId('btn-confirm-conflict-closure');
      expect(confirmBtn).toHaveTextContent('Tôi hiểu và tiếp tục lưu');

      await user.click(confirmBtn);
      await waitFor(() => {
        expect(screen.queryByText('Cảnh báo xung đột đặt phòng')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('closure-form-error')).toHaveTextContent(
        'Không tìm thấy khung đóng cửa',
      );
    });

    it('blocks partial single-bound edit on a past closure without calling API (R1-04)', async () => {
      const user = userEvent.setup();
      const pastDay = formatVnDate(new Date(Date.now() - 48 * 60 * 60 * 1000));
      const pastClosure: ClosureItem = {
        ...mockClosureRoom,
        id: 'closure-past-partial',
        startTime: new Date(`${pastDay}T08:00:00.000+07:00`).toISOString(),
        endTime: new Date(`${pastDay}T11:00:00.000+07:00`).toISOString(),
        reason: 'Khung quá khứ',
      };
      vi.mocked(adminClosureApi.list).mockResolvedValue(
        okResponse({
          items: [pastClosure],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        }),
      );

      render(<AdminClosuresPage />);
      await screen.findByTestId('closure-row-closure-past-partial');

      await user.click(screen.getByTestId('btn-edit-closure-closure-past-partial'));
      fireEvent.change(screen.getByTestId('closure-start-time'), {
        target: { value: `${pastDay}T09:00` },
      });
      await user.click(screen.getByTestId('btn-submit-closure'));

      expect(screen.getByTestId('closure-end-time-error')).toHaveTextContent('tương lai');
      expect(adminClosureApi.update).not.toHaveBeenCalled();
    });
  });
});
