import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminBookingTable } from '../components/admin/bookings/AdminBookingTable';
import { AdminBookingItem } from '../types/admin-booking';

const NOW = new Date('2026-10-22T03:00:00.000Z').getTime();

function booking(id: string, endTime: number, status = 'CONFIRMED'): AdminBookingItem {
  return {
    id,
    bookingCode: `CS-20261022-${id}`,
    room: { id: 'room-1', name: 'Meeting room' },
    startTime: new Date(endTime - 3_600_000).toISOString(),
    endTime: new Date(endTime).toISOString(),
    totalAmount: '100000',
    status,
    paymentStatus: 'UNPAID',
    paymentMethod: null,
    note: null,
    customer: { kind: 'GUEST', name: 'Guest', phone: null },
  };
}

function renderTable(bookings: AdminBookingItem[]) {
  const callbacks = {
    onConfirmPayment: vi.fn(),
    onComplete: vi.fn(),
    onNoShow: vi.fn(),
    onCancel: vi.fn(),
  };
  return { ...render(<AdminBookingTable bookings={bookings} {...callbacks} />), ...callbacks };
}

function expectFinalization(id: string, visible: boolean) {
  for (const action of ['complete', 'no-show']) {
    const button = screen.queryByTestId(`${action}-booking-btn-${id}`);
    if (visible) expect(button).toBeInTheDocument();
    else expect(button).not.toBeInTheDocument();
  }
}

describe('AdminBookingTable lifecycle actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides finalization for future and in-progress bookings while preserving payment and cancel', () => {
    const future = booking('future', NOW + 7_200_000);
    const inProgress = booking('in-progress', NOW + 1_800_000);
    const { onConfirmPayment, onCancel } = renderTable([future, inProgress]);

    for (const item of [future, inProgress]) {
      expectFinalization(item.id, false);
      fireEvent.click(screen.getByTestId(`confirm-payment-btn-${item.id}`));
      expect(onConfirmPayment).toHaveBeenLastCalledWith(item);
      fireEvent.click(screen.getByTestId(`cancel-booking-btn-${item.id}`));
      expect(onCancel).toHaveBeenLastCalledWith(item);
    }
  });

  it('reveals actions at each exact end boundary without a parent render', () => {
    const first = booking('first', NOW + 1_000);
    const second = booking('second', NOW + 2_000);
    const { onComplete, onNoShow } = renderTable([second, first]);

    act(() => vi.advanceTimersByTime(999));
    expectFinalization(first.id, false);
    act(() => vi.advanceTimersByTime(1));
    expectFinalization(first.id, true);
    expectFinalization(second.id, false);
    fireEvent.click(screen.getByTestId(`complete-booking-btn-${first.id}`));
    expect(onComplete).toHaveBeenCalledWith(first);

    act(() => vi.advanceTimersByTime(1_000));
    expectFinalization(second.id, true);
    fireEvent.click(screen.getByTestId(`no-show-booking-btn-${second.id}`));
    expect(onNoShow).toHaveBeenCalledWith(second);
  });

  it('shows actions for ended confirmed bookings but hides them for terminal states', () => {
    const statuses = ['CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];
    renderTable(statuses.map((status) => booking(status, NOW, status)));

    for (const status of statuses) expectFinalization(status, status === 'CONFIRMED');
  });

  it('refreshes on focus when time passes while the window is inactive', () => {
    renderTable([booking('focus', NOW + 1_000)]);
    vi.setSystemTime(NOW + 1_000);
    expectFinalization('focus', false);

    fireEvent.focus(window);

    expectFinalization('focus', true);
  });

  it('keeps long future bookings hidden until their end without timeout overflow', () => {
    const maxTimeout = 2_147_483_647;
    renderTable([booking('long', NOW + maxTimeout + 1_000)]);

    act(() => vi.advanceTimersByTime(maxTimeout));
    expectFinalization('long', false);
    act(() => vi.advanceTimersByTime(999));
    expectFinalization('long', false);
    act(() => vi.advanceTimersByTime(1));
    expectFinalization('long', true);
  });

  it('cleans up its pending timer and focus listener on unmount', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderTable([booking('cleanup', NOW + 1_000)]);
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith('focus', expect.any(Function));
  });
});
