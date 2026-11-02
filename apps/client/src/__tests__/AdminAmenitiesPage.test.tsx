import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAmenitiesPage } from '../pages/AdminAmenitiesPage';
import { adminAmenityApi, AdminAmenity } from '../services/admin-amenity.api';

vi.mock('../services/admin-amenity.api', () => ({
  adminAmenityApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const wifi: AdminAmenity = {
  id: 'a-wifi',
  name: 'Wi-Fi',
  icon: 'wifi',
  description: 'Internet nhanh',
  roomCount: 3,
};
const unused: AdminAmenity = {
  id: 'a-unused',
  name: 'Máy pha trà',
  icon: null,
  description: null,
  roomCount: 0,
};
const ok = <T,>(data: T) => ({ success: true as const, message: 'OK', data });

describe('AdminAmenitiesPage (CWB-65)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAmenityApi.list).mockResolvedValue(ok([wifi, unused]));
  });

  it('lists amenities with their room usage', async () => {
    render(<AdminAmenitiesPage />);

    const row = await screen.findByTestId('amenity-row-a-wifi');
    expect(row).toHaveTextContent('Wi-Fi');
    expect(row).toHaveTextContent('3 phòng');
    expect(screen.getByTestId('amenity-row-a-unused')).toHaveTextContent('0 phòng');
  });

  it('shows a retryable error state', async () => {
    const user = userEvent.setup();
    vi.mocked(adminAmenityApi.list)
      .mockRejectedValueOnce({ response: { data: { message: 'Lỗi máy chủ' } } })
      .mockResolvedValueOnce(ok([wifi]));
    render(<AdminAmenitiesPage />);

    expect(await screen.findByText('Lỗi máy chủ')).toBeInTheDocument();
    await user.click(screen.getByTestId('amenity-retry'));
    expect(await screen.findByTestId('amenity-row-a-wifi')).toBeInTheDocument();
  });

  it('creates an amenity with trimmed values and reloads the list', async () => {
    const user = userEvent.setup();
    vi.mocked(adminAmenityApi.create).mockResolvedValue(
      ok({ id: 'a-new', name: 'Máy chiếu', icon: 'projector', description: null }),
    );
    render(<AdminAmenitiesPage />);
    await screen.findByTestId('amenity-row-a-wifi');

    await user.type(screen.getByLabelText('Tên tiện ích'), '  Máy chiếu ');
    await user.type(screen.getByLabelText('Icon'), 'projector');
    await user.click(screen.getByRole('button', { name: 'Thêm tiện ích' }));

    expect(adminAmenityApi.create).toHaveBeenCalledWith({
      name: 'Máy chiếu',
      icon: 'projector',
      description: '',
    });
    await waitFor(() => expect(adminAmenityApi.list).toHaveBeenCalledTimes(2));
  });

  it('validates name and icon format before calling the API, and shows server conflicts', async () => {
    const user = userEvent.setup();
    vi.mocked(adminAmenityApi.create).mockRejectedValue({
      response: { status: 409, data: { message: 'Tên tiện ích đã tồn tại' } },
    });
    render(<AdminAmenitiesPage />);
    await screen.findByTestId('amenity-row-a-wifi');

    await user.click(screen.getByRole('button', { name: 'Thêm tiện ích' }));
    expect(screen.getByTestId('amenity-form-error')).toHaveTextContent('không được để trống');

    await user.type(screen.getByLabelText('Tên tiện ích'), 'Wi-Fi');
    await user.type(screen.getByLabelText('Icon'), 'Wi Fi!');
    await user.click(screen.getByRole('button', { name: 'Thêm tiện ích' }));
    expect(screen.getByTestId('amenity-form-error')).toHaveTextContent('chữ thường');
    expect(adminAmenityApi.create).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Icon'));
    await user.click(screen.getByRole('button', { name: 'Thêm tiện ích' }));
    expect(await screen.findByText('Tên tiện ích đã tồn tại')).toBeInTheDocument();
  });

  it('edits an existing amenity', async () => {
    const user = userEvent.setup();
    vi.mocked(adminAmenityApi.update).mockResolvedValue(ok({ ...wifi, name: 'Wi-Fi 6' }));
    render(<AdminAmenitiesPage />);

    await user.click(await screen.findByRole('button', { name: 'Sửa Wi-Fi' }));
    const name = screen.getByLabelText('Tên tiện ích');
    expect(name).toHaveValue('Wi-Fi');
    await user.clear(name);
    await user.type(name, 'Wi-Fi 6');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(adminAmenityApi.update).toHaveBeenCalledWith('a-wifi', {
      name: 'Wi-Fi 6',
      icon: 'wifi',
      description: 'Internet nhanh',
    });
  });

  it('blocks deleting an amenity that rooms use and deletes an unused one', async () => {
    const user = userEvent.setup();
    vi.mocked(adminAmenityApi.remove).mockResolvedValue(ok(null));
    render(<AdminAmenitiesPage />);

    await user.click(await screen.findByRole('button', { name: 'Xóa Wi-Fi' }));
    const inUse = await screen.findByTestId('amenity-delete-dialog');
    expect(inUse).toHaveTextContent('đang được gán cho 3 phòng');
    expect(within(inUse).getByTestId('amenity-delete-confirm')).toBeDisabled();
    await user.click(within(inUse).getByRole('button', { name: 'Quay lại' }));

    await user.click(screen.getByRole('button', { name: 'Xóa Máy pha trà' }));
    await user.click(await screen.findByTestId('amenity-delete-confirm'));
    expect(adminAmenityApi.remove).toHaveBeenCalledWith('a-unused');
  });
});
