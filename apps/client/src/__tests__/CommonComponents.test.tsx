import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { StatusBadge } from '../components/common/StatusBadge';
import { Pagination } from '../components/common/Pagination';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { Field } from '../components/common/Field';
import { ErrorState } from '../components/common/EmptyState';
import { Input } from '@/components/ui/input';
import { getPaymentMethodLabel, getStatusMeta } from '../utils/status';

describe('status utils', () => {
  it('maps every known status to a Vietnamese label and tone', () => {
    expect(getStatusMeta('booking', 'CONFIRMED')).toEqual({
      label: 'Đã xác nhận',
      tone: 'confirmed',
    });
    expect(getStatusMeta('booking', 'NO_SHOW')).toEqual({ label: 'Không đến', tone: 'noshow' });
    expect(getStatusMeta('payment', 'PAID')).toEqual({ label: 'Đã thanh toán', tone: 'success' });
    expect(getStatusMeta('payment', 'UNPAID').tone).toBe('unpaid');
    expect(getStatusMeta('room', 'MAINTENANCE')).toEqual({ label: 'Bảo trì', tone: 'maintenance' });
  });

  it('falls back to a neutral tone with the raw value for unknown statuses', () => {
    expect(getStatusMeta('booking', 'ARCHIVED')).toEqual({ label: 'ARCHIVED', tone: 'neutral' });
  });

  it('labels payment methods', () => {
    expect(getPaymentMethodLabel('CASH')).toBe('Tiền mặt');
    expect(getPaymentMethodLabel('QR')).toBe('Chuyển khoản QR');
    expect(getPaymentMethodLabel(null)).toBe('Chưa có');
  });
});

describe('StatusBadge', () => {
  it('renders the label and exposes data-status / data-tone', () => {
    render(<StatusBadge kind="booking" status="CANCELLED" data-testid="badge" />);
    const badge = screen.getByTestId('badge');
    expect(badge).toHaveTextContent('Đã hủy');
    expect(badge).toHaveAttribute('data-status', 'CANCELLED');
    expect(badge).toHaveAttribute('data-tone', 'cancelled');
  });

  it('allows overriding the label (raw enum on admin tables)', () => {
    render(<StatusBadge kind="room" status="MAINTENANCE" label="MAINTENANCE" />);
    expect(screen.getByText('MAINTENANCE')).toHaveAttribute('data-status', 'MAINTENANCE');
  });
});

describe('Pagination', () => {
  it('disables the previous button on the first page and moves forward', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />);

    expect(screen.getByRole('navigation', { name: 'Điều hướng phân trang' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables the next button on the last page', () => {
    render(<Pagination page={3} totalPages={3} onPageChange={() => {}} info="3 / 3" />);
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });
});

describe('SegmentedControl', () => {
  it('marks the selected option with aria-pressed and reports changes', async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [value, setValue] = useState<'all' | 'upcoming'>('all');
      return (
        <SegmentedControl
          ariaLabel="Lọc theo trạng thái"
          value={value}
          onChange={setValue}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'upcoming', label: 'Sắp tới' },
          ]}
        />
      );
    };
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Sắp tới' }));
    expect(screen.getByRole('button', { name: 'Sắp tới' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Field', () => {
  it('wires label, error and aria attributes to the control', () => {
    render(
      <Field id="email" label="Email" error="Email không hợp lệ" errorTestId="email-err">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('id', 'email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'email-error');
    expect(screen.getByTestId('email-err')).toHaveAttribute('role', 'alert');
  });

  it('shows a hint when there is no error', () => {
    render(
      <Field id="phone" label="Số điện thoại" hint="Không bắt buộc">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Số điện thoại')).toHaveAttribute(
      'aria-describedby',
      'phone-hint',
    );
    expect(screen.getByText('Không bắt buộc')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('announces the error and retries', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState title="Không thể tải dữ liệu" onRetry={onRetry} retryTestId="retry" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu');
    await user.click(screen.getByTestId('retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
