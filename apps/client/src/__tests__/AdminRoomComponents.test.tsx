import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomTable } from '../components/admin/rooms/RoomTable';
import { MaintenanceWarning } from '../components/admin/rooms/MaintenanceWarning';
import type { RoomListItem } from '../types/room';
import type { FutureBookingWarningDetails } from '../types/admin-room';

const rooms: RoomListItem[] = [
  {
    id: 'room-1',
    name: 'Phòng Họp A',
    capacity: 8,
    pricePerHour: '150000.00',
    status: 'AVAILABLE',
    coverImage: 'https://images.example.com/a.jpg',
    amenities: [{ id: 'am-1', name: 'Wi-Fi', icon: 'wifi', description: null }],
  },
  {
    id: 'room-2',
    name: 'Phòng Riêng B',
    capacity: 2,
    pricePerHour: '90000.00',
    status: 'MAINTENANCE',
    coverImage: null,
    amenities: [],
  },
];

const warning: FutureBookingWarningDetails = {
  futureBookingCount: 2,
  bookings: [
    {
      bookingCode: 'CS-20261101-AAAA',
      startTime: '2026-11-01T02:00:00.000Z',
      endTime: '2026-11-01T04:00:00.000Z',
    },
    {
      bookingCode: 'CS-20261102-BBBB',
      startTime: '2026-11-02T05:00:00.000Z',
      endTime: '2026-11-02T07:00:00.000Z',
    },
  ],
};

describe('RoomTable', () => {
  it('renders one row per room with capacity, price, raw status and amenities', () => {
    render(<RoomTable rooms={rooms} onEdit={vi.fn()} />);

    const table = screen.getByTestId('admin-room-table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);

    const rowA = screen.getByTestId('admin-room-row-room-1');
    expect(within(rowA).getByText('Phòng Họp A')).toBeInTheDocument();
    expect(within(rowA).getByText('8 người')).toBeInTheDocument();
    expect(within(rowA).getByText('150.000 đ/h')).toBeInTheDocument();
    expect(within(rowA).getByText('AVAILABLE')).toHaveAttribute('data-status', 'AVAILABLE');
    expect(within(rowA).getByText('Wi-Fi')).toBeInTheDocument();
    expect(within(rowA).getByRole('img', { name: 'Phòng Họp A' })).toHaveAttribute(
      'src',
      'https://images.example.com/a.jpg',
    );

    const rowB = screen.getByTestId('admin-room-row-room-2');
    expect(within(rowB).getByText('MAINTENANCE')).toHaveAttribute('data-status', 'MAINTENANCE');
    expect(within(rowB).getByText('Không ảnh')).toBeInTheDocument();
    expect(within(rowB).getByText('—')).toBeInTheDocument();
  });

  it('calls onEdit with the room id and the clicked button', () => {
    const onEdit = vi.fn();
    render(<RoomTable rooms={rooms} onEdit={onEdit} />);

    const editBtn = screen.getByTestId('admin-edit-btn-room-2');
    fireEvent.click(editBtn);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith('room-2', editBtn);
  });

  it('disables and relabels only the row whose details are loading', () => {
    render(<RoomTable rooms={rooms} loadingRoomId="room-1" onEdit={vi.fn()} />);

    const loadingBtn = screen.getByTestId('admin-edit-btn-room-1');
    expect(loadingBtn).toBeDisabled();
    expect(loadingBtn).toHaveTextContent('Đang tải...');
    expect(screen.getByTestId('admin-edit-btn-room-2')).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(1);
  });

  it('exposes no delete or status controls', () => {
    render(<RoomTable rooms={rooms} onEdit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /xóa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('MaintenanceWarning', () => {
  it('focuses the safe action and dismisses with Escape without confirming maintenance', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const onConfirm = vi.fn();
    render(
      <MaintenanceWarning
        warning={warning}
        isConfirming={false}
        onDismiss={onDismiss}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole('button', { name: 'Quay lại' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders an accessible alertdialog listing every future booking', () => {
    render(
      <MaintenanceWarning
        warning={warning}
        isConfirming={false}
        onDismiss={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('alertdialog', {
      name: 'Cảnh báo: Phòng có 2 booking sắp tới',
    });
    expect(dialog).toHaveAttribute('data-testid', 'admin-future-booking-warning');
    expect(dialog).toHaveAccessibleDescription(/không tự động hủy/i);

    const list = screen.getByTestId('admin-future-booking-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('CS-20261101-AAAA')).toBeInTheDocument();
    expect(within(list).getByText('CS-20261102-BBBB')).toBeInTheDocument();
  });

  it('fires onDismiss and onConfirm from the action buttons', () => {
    const onDismiss = vi.fn();
    const onConfirm = vi.fn();
    render(
      <MaintenanceWarning
        warning={warning}
        isConfirming={false}
        onDismiss={onDismiss}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('admin-warning-cancel-btn'));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Vẫn chuyển sang bảo trì' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables both actions and shows progress while confirming', () => {
    render(
      <MaintenanceWarning warning={warning} isConfirming onDismiss={vi.fn()} onConfirm={vi.fn()} />,
    );

    expect(screen.getByTestId('admin-warning-cancel-btn')).toBeDisabled();
    const confirmBtn = screen.getByTestId('admin-warning-confirm-btn');
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn).toHaveTextContent('Đang chuyển...');
  });
});
