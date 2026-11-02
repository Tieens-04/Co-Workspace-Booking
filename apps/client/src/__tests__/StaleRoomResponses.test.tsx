import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '../pages/AdminPage';
import { AdminGuestBookingForm } from '../components/AdminGuestBookingForm';
import { AuthContext, AuthContextType } from '../context/auth-context-base';
import { roomApi } from '../services/room.api';
import { adminRoomApi } from '../services/admin-room.api';
import { ApiResponse, GetRoomsResponseData, RoomListItem } from '../types/room';

vi.mock('../services/room.api', () => ({
  roomApi: {
    getAmenities: vi.fn(),
    getRoomById: vi.fn(),
    getRooms: vi.fn(),
    getAvailability: vi.fn(),
  },
}));

vi.mock('../services/admin-room.api', () => ({
  adminRoomApi: {
    getAdminRooms: vi.fn(),
    createRoom: vi.fn(),
    updateRoom: vi.fn(),
    uploadRoomImages: vi.fn(),
  },
}));

type RoomsResponse = ApiResponse<GetRoomsResponseData>;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const room = (id: string, name: string): RoomListItem => ({
  id,
  name,
  capacity: 4,
  pricePerHour: '100.00',
  status: 'AVAILABLE',
  coverImage: null,
  amenities: [],
});

const page = (items: RoomListItem[], pageNo: number, totalPages: number): RoomsResponse => ({
  success: true,
  message: 'OK',
  data: {
    items,
    pagination: { page: pageNo, limit: 10, total: totalPages * 10, totalPages },
  },
});

const authValue = (id: string): AuthContextType => ({
  token: `token-${id}`,
  principal: { id, email: `${id}@example.com`, fullName: id, role: 'ADMIN' },
  isAuthenticated: true,
  isLoading: false,
  sessionExpired: false,
  clearSessionExpiredNotice: vi.fn(),
  login: vi.fn(),
  applyProfile: vi.fn(),
  logout: vi.fn(),
});

const renderAdminPage = (principalId: string) => {
  const view = (id: string) => (
    <AuthContext.Provider value={authValue(id)}>
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    </AuthContext.Provider>
  );
  const utils = render(view(principalId));
  return { ...utils, switchTo: (id: string) => utils.rerender(view(id)) };
};

describe('Stale room list responses (CWB-54)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(roomApi.getAmenities).mockResolvedValue({ success: true, message: 'OK', data: [] });
  });

  describe('AdminPage room list', () => {
    it('ignores an older session response that resolves after the newer one', async () => {
      const first = deferred<RoomsResponse>();
      const second = deferred<RoomsResponse>();
      vi.mocked(adminRoomApi.getAdminRooms)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);

      const { switchTo } = renderAdminPage('admin-a');
      await waitFor(() => expect(adminRoomApi.getAdminRooms).toHaveBeenCalledTimes(1));
      const firstSignal = vi.mocked(adminRoomApi.getAdminRooms).mock.calls[0][1];

      switchTo('admin-b');
      await waitFor(() => expect(adminRoomApi.getAdminRooms).toHaveBeenCalledTimes(2));
      expect(firstSignal?.aborted).toBe(true);
      expect(vi.mocked(adminRoomApi.getAdminRooms).mock.calls[1][0]).toEqual({
        page: 1,
        limit: 10,
      });

      await act(async () => second.resolve(page([room('room-b', 'Phòng phiên B')], 1, 1)));
      await act(async () => first.resolve(page([room('room-a', 'Phòng phiên A')], 3, 5)));

      expect(await screen.findByText('Phòng phiên B')).toBeInTheDocument();
      expect(screen.queryByText('Phòng phiên A')).not.toBeInTheDocument();
      expect(screen.queryByTestId('admin-pagination')).not.toBeInTheDocument();
    });

    it('does not let a stale failure replace the latest successful list', async () => {
      const first = deferred<RoomsResponse>();
      vi.mocked(adminRoomApi.getAdminRooms)
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce(page([room('room-b', 'Phòng mới nhất')], 1, 1));

      const { switchTo } = renderAdminPage('admin-a');
      await waitFor(() => expect(adminRoomApi.getAdminRooms).toHaveBeenCalledTimes(1));
      switchTo('admin-b');

      expect(await screen.findByText('Phòng mới nhất')).toBeInTheDocument();
      await act(async () => first.reject({ response: { data: { message: 'Lỗi từ request cũ' } } }));

      expect(screen.getByText('Phòng mới nhất')).toBeInTheDocument();
      expect(screen.queryByText('Lỗi từ request cũ')).not.toBeInTheDocument();
    });

    it('aborts the in-flight list request on unmount', async () => {
      vi.mocked(adminRoomApi.getAdminRooms).mockReturnValue(deferred<RoomsResponse>().promise);

      const { unmount } = renderAdminPage('admin-a');
      await waitFor(() => expect(adminRoomApi.getAdminRooms).toHaveBeenCalledTimes(1));
      const signal = vi.mocked(adminRoomApi.getAdminRooms).mock.calls[0][1];

      unmount();
      expect(signal?.aborted).toBe(true);
    });
  });

  describe('AdminGuestBookingForm room selector', () => {
    const renderForm = (principalId: string) => {
      const view = (id: string) => (
        <AdminGuestBookingForm isOpen={true} onToggleOpen={vi.fn()} principalId={id} />
      );
      const utils = render(view(principalId));
      return { ...utils, switchTo: (id: string) => utils.rerender(view(id)) };
    };

    const optionNames = () =>
      Array.from(
        (screen.getByTestId('guest-room-select') as HTMLSelectElement).options,
        (o) => o.textContent ?? '',
      );

    it('keeps only the newest page after a session switch races a page change', async () => {
      const user = userEvent.setup();
      const pageTwo = deferred<RoomsResponse>();
      vi.mocked(roomApi.getRooms)
        .mockResolvedValueOnce(page([room('room-1', 'Phòng trang 1')], 1, 2))
        .mockReturnValueOnce(pageTwo.promise)
        .mockResolvedValueOnce(page([room('room-new', 'Phòng phiên mới')], 1, 1));

      const { switchTo } = renderForm('admin-a');
      await waitFor(() => expect(optionNames().join()).toContain('Phòng trang 1'));

      await user.click(screen.getByRole('button', { name: 'Trang sau' }));
      await waitFor(() => expect(roomApi.getRooms).toHaveBeenCalledTimes(2));
      const pageTwoSignal = vi.mocked(roomApi.getRooms).mock.calls[1][1];

      switchTo('admin-b');
      await waitFor(() => expect(optionNames().join()).toContain('Phòng phiên mới'));
      expect(pageTwoSignal?.aborted).toBe(true);
      expect(vi.mocked(roomApi.getRooms).mock.calls.at(-1)?.[0]).toEqual({ page: 1, limit: 10 });

      await act(async () => pageTwo.resolve(page([room('room-2', 'Phòng trang 2 cũ')], 2, 2)));

      expect(optionNames().join()).toContain('Phòng phiên mới');
      expect(optionNames().join()).not.toContain('Phòng trang 2 cũ');
      expect(screen.queryByRole('button', { name: 'Trang sau' })).not.toBeInTheDocument();
    });

    it('keeps the selected room when moving to a page that does not list it', async () => {
      const user = userEvent.setup();
      vi.mocked(roomApi.getRooms)
        .mockResolvedValueOnce(page([room('room-1', 'Phòng đã chọn')], 1, 2))
        .mockResolvedValueOnce(page([room('room-2', 'Phòng trang hai')], 2, 2));

      renderForm('admin-a');
      await waitFor(() => expect(optionNames().join()).toContain('Phòng đã chọn'));
      await user.selectOptions(screen.getByTestId('guest-room-select'), 'room-1');

      await user.click(screen.getByRole('button', { name: 'Trang sau' }));
      await waitFor(() => expect(optionNames().join()).toContain('Phòng trang hai'));

      const select = screen.getByTestId('guest-room-select') as HTMLSelectElement;
      expect(select.value).toBe('room-1');
      expect(optionNames().join()).toContain('Phòng đã chọn');
    });
  });
});
