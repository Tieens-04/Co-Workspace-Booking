import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminBookingItem } from '../types/admin-booking';
import { ConfirmPaymentDialog } from '../components/admin/bookings/ConfirmPaymentDialog';
import { CancelBookingDialog } from '../components/admin/bookings/CancelBookingDialog';

const booking: AdminBookingItem = {
  id: 'booking-dialog-1',
  bookingCode: 'CS-20261018-4821',
  room: { id: 'room-1', name: 'Meeting Room Creative 4P' },
  startTime: '2026-10-19T06:00:00.000Z',
  endTime: '2026-10-19T08:00:00.000Z',
  totalAmount: '360000.00',
  note: null,
  status: 'CONFIRMED',
  paymentStatus: 'UNPAID',
  paymentMethod: null,
  customer: { kind: 'USER', name: 'Nguyễn Thu Lan', phone: '0901234567' },
};

/** Mirrors the page: closing clears the target booking. */
function PaymentHarness({ isSubmitting, onClose }: { isSubmitting: boolean; onClose: () => void }) {
  const [target, setTarget] = useState<AdminBookingItem | null>(booking);
  return (
    <ConfirmPaymentDialog
      booking={target}
      paymentMethod="CASH"
      onPaymentMethodChange={() => {}}
      isSubmitting={isSubmitting}
      error={null}
      onSubmit={(e) => e.preventDefault()}
      onClose={() => {
        onClose();
        setTarget(null);
      }}
    />
  );
}

function CancelHarness({ isSubmitting, onClose }: { isSubmitting: boolean; onClose: () => void }) {
  const [target, setTarget] = useState<AdminBookingItem | null>(booking);
  return (
    <CancelBookingDialog
      booking={target}
      reason=""
      onReasonChange={() => {}}
      validationError={null}
      isSubmitting={isSubmitting}
      error={null}
      onSubmit={(e) => e.preventDefault()}
      onClose={() => {
        onClose();
        setTarget(null);
      }}
    />
  );
}

describe('ConfirmPaymentDialog', () => {
  it('is an accessible dialog labelled by its title and description', () => {
    render(<PaymentHarness isSubmitting={false} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Xác nhận thanh toán' });
    expect(dialog).toHaveAttribute('data-testid', 'confirm-payment-modal');
    expect(dialog).toHaveAccessibleDescription(/CS-20261018-4821/);
    expect(screen.getByTestId('payment-method-select')).toHaveValue('CASH');
  });

  it('closes on Escape when idle', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PaymentHarness isSubmitting={false} onClose={onClose} />);

    expect(screen.getByTestId('confirm-payment-modal')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('confirm-payment-modal')).not.toBeInTheDocument();
  });

  it('stays open on Escape and on the close button while submitting', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PaymentHarness isSubmitting={true} onClose={onClose} />);

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Đóng' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-payment-modal')).toBeInTheDocument();
    expect(screen.getByTestId('submit-payment-btn')).toBeDisabled();
    expect(screen.getByTestId('submit-payment-btn')).toHaveTextContent('Đang xác nhận...');
  });
});

describe('CancelBookingDialog', () => {
  it('is an accessible dialog with a labelled reason field', () => {
    render(<CancelHarness isSubmitting={false} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Hủy đơn đặt phòng' });
    expect(dialog).toHaveAttribute('data-testid', 'admin-cancel-modal');
    expect(screen.getByLabelText(/Lý do hủy đơn/)).toBe(screen.getByTestId('cancel-reason-input'));
  });

  it('closes on Escape when idle', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CancelHarness isSubmitting={false} onClose={onClose} />);

    expect(screen.getByTestId('admin-cancel-modal')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('admin-cancel-modal')).not.toBeInTheDocument();
  });

  it('stays open on Escape while submitting', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CancelHarness isSubmitting={true} onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('admin-cancel-modal')).toBeInTheDocument();
    expect(screen.getByTestId('submit-cancel-btn')).toBeDisabled();
    expect(screen.getByTestId('submit-cancel-btn')).toHaveTextContent('Đang hủy...');
  });
});
