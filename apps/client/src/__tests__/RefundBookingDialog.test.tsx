import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

function makeDecimalBooking(
  totalAmount: string,
  refundedAmount: string,
  overrides: Partial<AdminBookingItem> = {},
): AdminBookingItem {
  return {
    ...mockBooking,
    totalAmount,
    refundedAmount,
    ...overrides,
  };
}

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

  it('renders booking info and keeps submit button enabled when not submitting', () => {
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

    // Submit button is enabled so clicking it surfaces field-level errors instead of locking silently
    const submitBtn = screen.getByTestId('submit-refund-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
  });

  it('disables submit button only while request is submitting', () => {
    render(
      <RefundBookingDialog
        booking={mockBooking}
        isSubmitting={true}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const submitBtn = screen.getByTestId('submit-refund-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn).toHaveAttribute('aria-busy', 'true');
  });

  it('handles Jira AC decimal example 300.10 - 100.05 -> "200.05" cleanly', async () => {
    // Note: 300.10 - 100.05 === 200.05 in IEEE-754 without drift; real ULP drift is regression-tested by 300.15 - 100.10 and 100.30 - 50.10 below.
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    const booking = makeDecimalBooking('300.10', '100.05');

    render(
      <RefundBookingDialog
        booking={booking}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />,
    );

    const amountInput = screen.getByTestId('refund-amount-input') as HTMLInputElement;
    expect(amountInput.value).toBe('200.05');
    expect(amountInput).toHaveAttribute('max', '200.05');

    await user.type(screen.getByTestId('refund-reason-input'), 'Hoàn phần chênh lệch thập phân');
    await user.type(screen.getByTestId('refund-confirm-keyword'), 'HOÀN TIỀN');
    await user.click(screen.getByTestId('submit-refund-btn'));

    expect(handleSubmit).toHaveBeenCalledWith({
      amount: 200.05,
      method: 'QR',
      reason: 'Hoàn phần chênh lệch thập phân',
    });
  });

  it('avoids IEEE-754 float drift on 300.15 - 100.10 (would be 200.04999999999998 in float)', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    const booking = makeDecimalBooking('300.15', '100.10');

    render(
      <RefundBookingDialog
        booking={booking}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />,
    );

    const amountInput = screen.getByTestId('refund-amount-input') as HTMLInputElement;
    expect(amountInput.value).toBe('200.05');

    await user.type(screen.getByTestId('refund-reason-input'), 'Kiểm tra độ chính xác xu nguyên');
    await user.type(screen.getByTestId('refund-confirm-keyword'), 'HOÀN TIỀN');
    await user.click(screen.getByTestId('submit-refund-btn'));

    expect(handleSubmit).toHaveBeenCalledWith({
      amount: 200.05,
      method: 'QR',
      reason: 'Kiểm tra độ chính xác xu nguyên',
    });
  });

  it('allows exact max "50.20" and rejects "50.21" for 100.30 - 50.10 (IEEE-754 50.199999999999996 trap)', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    const booking = makeDecimalBooking('100.30', '50.10');

    render(
      <RefundBookingDialog
        booking={booking}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />,
    );

    const amountInput = screen.getByTestId('refund-amount-input') as HTMLInputElement;
    expect(amountInput.value).toBe('50.20');

    const reasonInput = screen.getByTestId('refund-reason-input');
    const confirmInput = screen.getByTestId('refund-confirm-keyword');
    const submitBtn = screen.getByTestId('submit-refund-btn');

    await user.type(reasonInput, 'Hoàn nốt số dư còn lại');
    await user.type(confirmInput, 'HOÀN TIỀN');

    // Re-type exact max "50.20"
    await user.clear(amountInput);
    await user.type(amountInput, '50.20');
    await user.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledWith({
      amount: 50.2,
      method: 'QR',
      reason: 'Hoàn nốt số dư còn lại',
    });

    // Exceeding by 0.01 ("50.21") triggers field error and does not call onSubmit
    handleSubmit.mockClear();
    await user.clear(amountInput);
    await user.type(amountInput, '50.21');
    await user.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Số tiền hoàn không được vượt quá 50,2 đ.')).toBeInTheDocument();
    expect(amountInput).toHaveAttribute('aria-invalid', 'true');
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

    const reasonInput = screen.getByTestId('refund-reason-input');
    const confirmInput = screen.getByTestId('refund-confirm-keyword');

    await user.type(reasonInput, 'Khách hủy hợp lệ');
    await user.type(confirmInput, mockBooking.bookingCode);
    await user.click(screen.getByTestId('submit-refund-btn'));

    expect(handleSubmit).toHaveBeenCalledWith({
      amount: 300000,
      method: 'QR',
      reason: 'Khách hủy hợp lệ',
    });
  });

  it('shows field-level errors on empty reason and empty confirm keyword when submitted', async () => {
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

    await user.click(screen.getByTestId('submit-refund-btn'));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText('Vui lòng nhập lý do hoàn tiền (tối thiểu 3 ký tự).'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vui lòng nhập "HOÀN TIỀN" hoặc mã đơn đặt phòng để xác nhận.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('refund-reason-input')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('refund-confirm-keyword')).toHaveAttribute('aria-invalid', 'true');
  });

  it('validates amount empty, <= 0, > 2 decimals, and > maxRefundable with field errors that clear on edit', async () => {
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

    const amountInput = screen.getByTestId('refund-amount-input');
    const reasonInput = screen.getByTestId('refund-reason-input');
    const confirmInput = screen.getByTestId('refund-confirm-keyword');
    const submitBtn = screen.getByTestId('submit-refund-btn');

    await user.type(reasonInput, 'Lý do test hoàn tiền');
    await user.type(confirmInput, 'HOÀN TIỀN');

    // Empty amount
    await user.clear(amountInput);
    await user.click(submitBtn);
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Vui lòng nhập số tiền hoàn.')).toBeInTheDocument();

    // Zero amount -> clears empty error on edit and validates <= 0 on submit
    await user.type(amountInput, '0');
    expect(screen.queryByText('Vui lòng nhập số tiền hoàn.')).not.toBeInTheDocument();
    await user.click(submitBtn);
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Số tiền hoàn phải lớn hơn 0đ.')).toBeInTheDocument();

    // Negative amount
    await user.clear(amountInput);
    await user.type(amountInput, '-10');
    await user.click(submitBtn);
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Số tiền hoàn phải lớn hơn 0đ.')).toBeInTheDocument();

    // More than 2 decimal places
    await user.clear(amountInput);
    await user.type(amountInput, '100.123');
    await user.click(submitBtn);
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText('Số tiền hoàn không hợp lệ (chỉ nhập số, tối đa 2 chữ số thập phân).'),
    ).toBeInTheDocument();

    // Scientific notation (e.g. "1e5" accepted by type="number")
    fireEvent.change(amountInput, { target: { value: '1e5' } });
    expect((amountInput as HTMLInputElement).value).toBe('1e5');
    await user.click(submitBtn);
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText('Số tiền hoàn không hợp lệ (chỉ nhập số, tối đa 2 chữ số thập phân).'),
    ).toBeInTheDocument();

    // Exceeding maxRefundable (300000)
    await user.clear(amountInput);
    await user.type(amountInput, '350000');
    await user.click(submitBtn);
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Số tiền hoàn không được vượt quá 300.000 đ.')).toBeInTheDocument();

    // Editing clears error and allows valid submit
    await user.clear(amountInput);
    await user.type(amountInput, '250000');
    expect(
      screen.queryByText('Số tiền hoàn không được vượt quá 300.000 đ.'),
    ).not.toBeInTheDocument();
    await user.click(submitBtn);
    expect(handleSubmit).toHaveBeenCalledWith({
      amount: 250000,
      method: 'QR',
      reason: 'Lý do test hoàn tiền',
    });
  });

  it('validates reason length (< 3 and > 500 chars) and wrong confirmation keyword, clearing each error on edit', async () => {
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

    const reasonInput = screen.getByTestId('refund-reason-input');
    const confirmInput = screen.getByTestId('refund-confirm-keyword');
    const submitBtn = screen.getByTestId('submit-refund-btn');

    await user.type(reasonInput, 'ab');
    await user.type(confirmInput, 'WRONG');
    await user.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText('Vui lòng nhập lý do hoàn tiền (tối thiểu 3 ký tự).'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vui lòng nhập "HOÀN TIỀN" hoặc mã đơn đặt phòng để xác nhận.'),
    ).toBeInTheDocument();

    await user.clear(reasonInput);
    expect(
      screen.queryByText('Vui lòng nhập lý do hoàn tiền (tối thiểu 3 ký tự).'),
    ).not.toBeInTheDocument();

    await user.click(reasonInput);
    await user.paste('a'.repeat(501));
    await user.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Lý do hoàn tiền không được vượt quá 500 ký tự.')).toBeInTheDocument();

    await user.clear(reasonInput);
    expect(
      screen.queryByText('Lý do hoàn tiền không được vượt quá 500 ký tự.'),
    ).not.toBeInTheDocument();
    await user.type(reasonInput, 'Hoàn tiền hợp lệ');

    await user.clear(confirmInput);
    expect(
      screen.queryByText('Vui lòng nhập "HOÀN TIỀN" hoặc mã đơn đặt phòng để xác nhận.'),
    ).not.toBeInTheDocument();
    await user.type(confirmInput, mockBooking.bookingCode);

    await user.click(submitBtn);
    expect(handleSubmit).toHaveBeenCalledWith({
      amount: 300000,
      method: 'QR',
      reason: 'Hoàn tiền hợp lệ',
    });
  });

  it('treats fully refunded (max = 0) or malformed decimal totals as 0 cents without IEEE-754 fallback', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    const { rerender } = render(
      <RefundBookingDialog
        booking={makeDecimalBooking('300.105', '0.00')}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />,
    );

    const amountInput = screen.getByTestId('refund-amount-input') as HTMLInputElement;
    expect(amountInput.value).toBe('0');

    await user.type(screen.getByTestId('refund-reason-input'), 'Kiểm tra dữ liệu lệch định dạng');
    await user.type(screen.getByTestId('refund-confirm-keyword'), 'HOÀN TIỀN');
    await user.click(screen.getByTestId('submit-refund-btn'));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Số tiền hoàn phải lớn hơn 0đ.')).toBeInTheDocument();

    rerender(
      <RefundBookingDialog
        booking={makeDecimalBooking('200.00', '200.00')}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />,
    );

    expect(amountInput.value).toBe('0');
    expect(amountInput).toHaveAttribute('max', '0');

    await user.type(screen.getByTestId('refund-reason-input'), 'Kiểm tra đơn đã hoàn hết');
    await user.type(screen.getByTestId('refund-confirm-keyword'), 'HOÀN TIỀN');
    await user.click(screen.getByTestId('submit-refund-btn'));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Số tiền hoàn phải lớn hơn 0đ.')).toBeInTheDocument();

    await user.clear(amountInput);
    await user.type(amountInput, '0.01');
    await user.click(screen.getByTestId('submit-refund-btn'));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Số tiền hoàn không được vượt quá 0 đ.')).toBeInTheDocument();
  });

  it('resets amount, reason, and keyword errors when opening a different booking', async () => {
    const user = userEvent.setup();
    const otherBooking = makeDecimalBooking('500.00', '0.00', {
      id: 'b-refund-2',
      bookingCode: 'CS-20261109-EFGH',
    });

    const { rerender } = render(
      <RefundBookingDialog
        booking={mockBooking}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    // Trigger errors on all 3 fields
    await user.clear(screen.getByTestId('refund-amount-input'));
    await user.click(screen.getByTestId('submit-refund-btn'));

    expect(screen.getByText('Vui lòng nhập số tiền hoàn.')).toBeInTheDocument();
    expect(
      screen.getByText('Vui lòng nhập lý do hoàn tiền (tối thiểu 3 ký tự).'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vui lòng nhập "HOÀN TIỀN" hoặc mã đơn đặt phòng để xác nhận.'),
    ).toBeInTheDocument();

    rerender(
      <RefundBookingDialog
        booking={otherBooking}
        isSubmitting={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByText('Vui lòng nhập số tiền hoàn.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Vui lòng nhập lý do hoàn tiền (tối thiểu 3 ký tự).'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Vui lòng nhập "HOÀN TIỀN" hoặc mã đơn đặt phòng để xác nhận.'),
    ).not.toBeInTheDocument();
    expect((screen.getByTestId('refund-amount-input') as HTMLInputElement).value).toBe('500');
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

    expect(screen.getByText('Số tiền hoàn vượt quá số tiền thu của đơn.')).toBeInTheDocument();
  });
});
