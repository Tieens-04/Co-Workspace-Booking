import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RefundBookingDialog } from '../components/admin/bookings/RefundBookingDialog';
import { AdminBookingItem } from '../types/admin-booking';

const mockBooking: AdminBookingItem = {
  id: 'b-refund-1',
  bookingCode: 'CS-20261108-ABCD',
  room: { id: 'room-1', name: 'Phòng Hội Thảo A' },
  startTime: '2026-11-08T10:00:00.000Z',
  endTime: '2026-11-08T12:00:00.000Z',
  totalAmount: '400000.00',
  refundedAmount: '100000.00',
  checkedInAt: null,
  attendanceTrackingEnabled: false,
  note: null,
  status: 'CANCELLED',
  paymentStatus: 'PARTIALLY_REFUNDED',
  paymentMethod: 'QR',
  customer: {
    kind: 'USER',
    name: 'Nguyễn Văn A',
    phone: '0987654321',
  },
};

describe('RefundBookingDialog', () => {
  it('does not render content when booking is null', () => {
    render(
      <RefundBookingDialog
        booking={null}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('admin-refund-modal')).not.toBeInTheDocument();
  });

  it('renders booking info and remaining refundable amount correctly', () => {
    render(
      <RefundBookingDialog
        booking={mockBooking}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('admin-refund-modal')).toBeInTheDocument();
    expect(screen.getAllByText('CS-20261108-ABCD').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Phòng Hội Thảo A/)).toBeInTheDocument();

    const amountInput = screen.getByTestId('refund-amount-input') as HTMLInputElement;
    // Remaining is 400000 - 100000 = 300000
    expect(amountInput.value).toBe('300000');

    // Method default is QR because mockBooking.paymentMethod is QR
    const methodSelect = screen.getByTestId('refund-method-select') as HTMLSelectElement;
    expect(methodSelect.value).toBe('QR');

    // Submit button is disabled because confirmKeyword and reason are empty
    const submitBtn = screen.getByTestId('submit-refund-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('enables submit button only when form is valid and confirmation keyword matches', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(
      <RefundBookingDialog
        booking={mockBooking}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />,
    );

    const submitBtn = screen.getByTestId('submit-refund-btn') as HTMLButtonElement;
    const reasonInput = screen.getByTestId('refund-reason-input');
    const confirmInput = screen.getByTestId('refund-confirm-keyword');

    // Enter reason
    await user.type(reasonInput, 'Khách hủy trước giờ quy định');
    expect(submitBtn.disabled).toBe(true);

    // Type wrong keyword
    await user.type(confirmInput, 'WRONG');
    expect(submitBtn.disabled).toBe(true);

    // Type matching keyword "HOÀN TIỀN"
    await user.clear(confirmInput);
    await user.type(confirmInput, 'HOÀN TIỀN');
    expect(submitBtn.disabled).toBe(false);

    // Submit
    await user.click(submitBtn);
    expect(handleSubmit).toHaveBeenCalledWith({
      amount: 300000,
      method: 'QR',
      reason: 'Khách hủy trước giờ quy định',
    });
  });

  it('accepts booking code as confirmation keyword', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(
      <RefundBookingDialog
        booking={mockBooking}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />,
    );

    const submitBtn = screen.getByTestId('submit-refund-btn') as HTMLButtonElement;
    const reasonInput = screen.getByTestId('refund-reason-input');
    const confirmInput = screen.getByTestId('refund-confirm-keyword');

    await user.type(reasonInput, 'Khách hủy hợp lệ');
    await user.type(confirmInput, mockBooking.bookingCode);

    expect(submitBtn.disabled).toBe(false);
    await user.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledWith({
      amount: 300000,
      method: 'QR',
      reason: 'Khách hủy hợp lệ',
    });
  });

  it('disables submit if amount exceeds remaining refundable amount', async () => {
    const user = userEvent.setup();

    render(
      <RefundBookingDialog
        booking={mockBooking}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const amountInput = screen.getByTestId('refund-amount-input');
    const reasonInput = screen.getByTestId('refund-reason-input');
    const confirmInput = screen.getByTestId('refund-confirm-keyword');
    const submitBtn = screen.getByTestId('submit-refund-btn') as HTMLButtonElement;

    await user.type(reasonInput, 'Lý do test hoàn tiền');
    await user.type(confirmInput, 'HOÀN TIỀN');
    expect(submitBtn.disabled).toBe(false);

    // Enter amount > 300000 (max remaining)
    await user.clear(amountInput);
    await user.type(amountInput, '350000');
    expect(submitBtn.disabled).toBe(true);
  });

  it('calls onClose when clicking cancel button', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <RefundBookingDialog
        booking={mockBooking}
        isSubmitting={false}
        error={null}
        onClose={handleClose}
        onSubmit={vi.fn()}
      />,
    );

    const cancelBtn = screen.getByTestId('cancel-refund-btn');
    await user.click(cancelBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('has noValidate on form and sets step="any" min="1" on amount input (F5 Regression)', () => {
    render(
      <RefundBookingDialog
        booking={mockBooking}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const amountInput = screen.getByTestId('refund-amount-input');
    const form = amountInput.closest('form');
    expect(form).toHaveAttribute('novalidate');

    expect(amountInput).toHaveAttribute('step', 'any');
    expect(amountInput).toHaveAttribute('min', '1');
  });

  it('renders error message when error prop is provided', () => {
    render(
      <RefundBookingDialog
        booking={mockBooking}
        isSubmitting={false}
        error="Số tiền hoàn vượt quá số tiền thu của đơn."
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Số tiền hoàn vượt quá số tiền thu của đơn.'),
    ).toBeInTheDocument();
  });
});
