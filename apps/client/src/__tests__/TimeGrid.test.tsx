import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeGrid, TimeGridProps } from '../components/TimeGrid';
import { RoomAvailabilitySlot } from '../types/room';

// Helper to generate 48 slots for a date
function createMockDaySlots(dateStr = '2026-10-25'): RoomAvailabilitySlot[] {
  const slots: RoomAvailabilitySlot[] = [];
  // Day start: 00:00 VN = 17:00 UTC previous day
  const dayStart = new Date(`${dateStr}T00:00:00.000+07:00`);
  for (let i = 0; i < 48; i++) {
    const slotStart = new Date(dayStart.getTime() + i * 30 * 60 * 1000);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
    slots.push({
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString(),
      status: 'AVAILABLE',
    });
  }
  return slots;
}

describe('TimeGrid component', () => {
  const fixedNow = new Date('2026-10-25T00:00:00.000+07:00'); // midnight VN

  const defaultProps: TimeGridProps = {
    slots: createMockDaySlots('2026-10-25'),
    onSelectStart: vi.fn(),
    onSelectRange: vi.fn(),
    now: fixedNow,
  };

  it('renders 48 slots and legend with appropriate labels', () => {
    render(<TimeGrid {...defaultProps} />);

    expect(screen.getAllByText('Trống')[0]).toBeInTheDocument();
    expect(screen.getByText('Đã đặt (không thể chọn)')).toBeInTheDocument();
    expect(screen.getByText('Đang chọn / Đã chọn')).toBeInTheDocument();
    expect(screen.getAllByText('Đã qua giờ')[0]).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(48);
  });

  describe('AC1: Slot đã đặt bị disable (xám)', () => {
    it('renders BOOKED slot as disabled and with slot-booked class', () => {
      const slots = createMockDaySlots('2026-10-25');
      // Slot 18 is 09:00 - 09:30 VN
      slots[18].status = 'BOOKED';

      render(<TimeGrid {...defaultProps} slots={slots} />);

      const bookedBtn = screen.getByTestId('time-slot-09:00');
      expect(bookedBtn).toBeDisabled();
      expect(bookedBtn).toHaveClass('slot-booked');
      expect(bookedBtn).toHaveAttribute('aria-label', expect.stringContaining('Đã đặt'));
    });

    it('does not trigger onSelectStart or onSelectRange when clicking BOOKED slot', async () => {
      const slots = createMockDaySlots('2026-10-25');
      slots[18].status = 'BOOKED';
      const onSelectStart = vi.fn();

      render(<TimeGrid {...defaultProps} slots={slots} onSelectStart={onSelectStart} />);

      const bookedBtn = screen.getByTestId('time-slot-09:00');
      fireEvent.click(bookedBtn);

      expect(onSelectStart).not.toHaveBeenCalled();
    });

    it('disables slots that are in the past or under 30min lead time', () => {
      // fixedNow is 09:15 VN
      const now = new Date('2026-10-25T09:15:00.000+07:00');
      const slots = createMockDaySlots('2026-10-25');

      render(<TimeGrid {...defaultProps} slots={slots} now={now} />);

      // 09:00 is in the past -> disabled, slot-past
      const pastBtn = screen.getByTestId('time-slot-09:00');
      expect(pastBtn).toBeDisabled();
      expect(pastBtn).toHaveClass('slot-past');

      // 09:30 is only 15 min from 09:15 (< 30 min lead time) -> disabled, slot-past
      const leadTimeBtn = screen.getByTestId('time-slot-09:30');
      expect(leadTimeBtn).toBeDisabled();
      expect(leadTimeBtn).toHaveClass('slot-past');

      // 10:00 is 45 min from 09:15 (>= 30 min lead time) -> available, enabled
      const availableBtn = screen.getByTestId('time-slot-10:00');
      expect(availableBtn).not.toBeDisabled();
      expect(availableBtn).toHaveClass('slot-available');
    });
  });

  describe('AC2: Click chọn slot cập nhật start/end time', () => {
    it('initiates selection on first click by calling onSelectStart with slot start ISO', async () => {
      const user = userEvent.setup();
      const onSelectStart = vi.fn();

      render(<TimeGrid {...defaultProps} onSelectStart={onSelectStart} />);

      const slotBtn = screen.getByTestId('time-slot-09:00');
      await user.click(slotBtn);

      expect(onSelectStart).toHaveBeenCalledTimes(1);
      const expectedIso = defaultProps.slots[18].startTime;
      expect(onSelectStart).toHaveBeenCalledWith(expectedIso);
    });

    it('displays selecting hint when selectingStartTime is active', () => {
      const selectingStartIso = defaultProps.slots[18].startTime; // 09:00 VN

      render(<TimeGrid {...defaultProps} selectingStartTime={selectingStartIso} />);

      expect(screen.getByTestId('time-grid-selecting-hint')).toHaveTextContent(
        'Đang chọn từ 09:00. Vui lòng click chọn ô kết thúc',
      );
    });

    it('completes valid 1-hour range when clicking 09:30 after 09:00', async () => {
      const user = userEvent.setup();
      const selectingStartIso = defaultProps.slots[18].startTime; // 09:00 VN
      const onSelectRange = vi.fn();

      render(
        <TimeGrid
          {...defaultProps}
          selectingStartTime={selectingStartIso}
          onSelectRange={onSelectRange}
        />,
      );

      // Clicking 09:30 means interval [09:00, 10:00) which is 1 hour
      const endSlotBtn = screen.getByTestId('time-slot-09:30');
      await user.click(endSlotBtn);

      expect(onSelectRange).toHaveBeenCalledTimes(1);
      expect(onSelectRange).toHaveBeenCalledWith(
        selectingStartIso,
        defaultProps.slots[19].endTime, // 10:00 VN
      );
    });

    it('rejects range crossing a BOOKED slot', async () => {
      const user = userEvent.setup();
      const slots = createMockDaySlots('2026-10-25');
      // 10:00 - 10:30 is BOOKED
      slots[20].status = 'BOOKED';

      const selectingStartIso = slots[18].startTime; // 09:00 VN
      const onSelectRange = vi.fn();

      render(
        <TimeGrid
          {...defaultProps}
          slots={slots}
          selectingStartTime={selectingStartIso}
          onSelectRange={onSelectRange}
        />,
      );

      // Try selecting end at 11:00 (slot 21: 10:30 - 11:00)
      const endSlotBtn = screen.getByTestId('time-slot-10:30');
      await user.click(endSlotBtn);

      expect(onSelectRange).not.toHaveBeenCalled();
      expect(screen.getByTestId('time-grid-error')).toHaveTextContent(
        'Khoảng thời gian đã chọn đi qua khung giờ đã có người đặt',
      );
    });

    it('rejects clicking same start slot (30 min duration) and shows minimum 1h notice', async () => {
      const user = userEvent.setup();
      const selectingStartIso = defaultProps.slots[18].startTime; // 09:00 VN
      const onSelectRange = vi.fn();

      render(
        <TimeGrid
          {...defaultProps}
          selectingStartTime={selectingStartIso}
          onSelectRange={onSelectRange}
        />,
      );

      const startSlotBtn = screen.getByTestId('time-slot-09:00');
      await user.click(startSlotBtn);

      expect(onSelectRange).not.toHaveBeenCalled();
      expect(screen.getByTestId('time-grid-error')).toHaveTextContent(
        'Thời lượng đặt phòng tối thiểu là 1 giờ',
      );
    });

    it('resets start to new slot if user clicks a slot before current selectingStart', async () => {
      const user = userEvent.setup();
      const selectingStartIso = defaultProps.slots[20].startTime; // 10:00 VN
      const onSelectStart = vi.fn();
      const onSelectRange = vi.fn();

      render(
        <TimeGrid
          {...defaultProps}
          selectingStartTime={selectingStartIso}
          onSelectStart={onSelectStart}
          onSelectRange={onSelectRange}
        />,
      );

      // User clicks 09:00 (before 10:00)
      const earlierSlotBtn = screen.getByTestId('time-slot-09:00');
      await user.click(earlierSlotBtn);

      expect(onSelectRange).not.toHaveBeenCalled();
      expect(onSelectStart).toHaveBeenCalledTimes(1);
      expect(onSelectStart).toHaveBeenCalledWith(defaultProps.slots[18].startTime);
    });

    it('rejects selection exceeding 8 hours', async () => {
      const user = userEvent.setup();
      const selectingStartIso = defaultProps.slots[18].startTime; // 09:00 VN
      const onSelectRange = vi.fn();

      render(
        <TimeGrid
          {...defaultProps}
          selectingStartTime={selectingStartIso}
          onSelectRange={onSelectRange}
        />,
      );

      // 17:30 VN (slot 35: 17:30 - 18:00) -> 09:00 to 18:00 is 9 hours (>8h)
      const lateSlotBtn = screen.getByTestId('time-slot-17:30');
      await user.click(lateSlotBtn);

      expect(onSelectRange).not.toHaveBeenCalled();
      expect(screen.getByTestId('time-grid-error')).toHaveTextContent(
        'Thời lượng đặt phòng tối đa là 8 giờ',
      );
    });

    it('highlights slots within selected range', () => {
      const selectedStartIso = defaultProps.slots[18].startTime; // 09:00 VN
      const selectedEndIso = defaultProps.slots[21].endTime; // 11:00 VN

      render(
        <TimeGrid
          {...defaultProps}
          selectedStartTime={selectedStartIso}
          selectedEndTime={selectedEndIso}
        />,
      );

      // 09:00, 09:30, 10:00, 10:30 should all have slot-selected
      expect(screen.getByTestId('time-slot-09:00')).toHaveClass('slot-selected');
      expect(screen.getByTestId('time-slot-09:30')).toHaveClass('slot-selected');
      expect(screen.getByTestId('time-slot-10:00')).toHaveClass('slot-selected');
      expect(screen.getByTestId('time-slot-10:30')).toHaveClass('slot-selected');

      // 11:00 should not be selected
      expect(screen.getByTestId('time-slot-11:00')).not.toHaveClass('slot-selected');
    });

    // F2 Regression: BOOKED slot must never have aria-pressed="true"
    it('F2: BOOKED slot never has aria-pressed="true" even if encompassed by selected range', () => {
      const slots = createMockDaySlots('2026-10-25');
      slots[19].status = 'BOOKED'; // 09:30 is BOOKED

      render(
        <TimeGrid
          {...defaultProps}
          slots={slots}
          selectedStartTime={slots[18].startTime}
          selectedEndTime={slots[21].endTime}
        />,
      );

      const bookedBtn = screen.getByTestId('time-slot-09:30');
      expect(bookedBtn).toHaveAttribute('aria-pressed', 'false');
      expect(bookedBtn).toBeDisabled();
      expect(bookedBtn).toHaveClass('slot-booked');
    });
  });

  describe('F1: Dynamic lead-time timer and real-time clock checks', () => {
    it('disables slot and prevents click when time advances past 30-minute lead time', () => {
      // Start at 08:29:00 VN (31 min before 09:00)
      const baseNow = new Date('2026-10-25T08:29:00.000+07:00');
      const slots = createMockDaySlots('2026-10-25');
      const onSelectStart = vi.fn();

      const { rerender } = render(
        <TimeGrid {...defaultProps} slots={slots} now={baseNow} onSelectStart={onSelectStart} />,
      );

      const slot0900 = screen.getByTestId('time-slot-09:00');
      expect(slot0900).not.toBeDisabled();

      // Advance time to 08:31:00 VN (29 min before 09:00 - lead time expired)
      const expiredNow = new Date('2026-10-25T08:31:00.000+07:00');
      rerender(
        <TimeGrid {...defaultProps} slots={slots} now={expiredNow} onSelectStart={onSelectStart} />,
      );

      expect(slot0900).toBeDisabled();
      expect(slot0900).toHaveClass('slot-past');

      fireEvent.click(slot0900);
      expect(onSelectStart).not.toHaveBeenCalled();
    });

    it('clears selection and rejects if selectingStartTime expires before clicking end slot', () => {
      const slots = createMockDaySlots('2026-10-25');
      const selectingStartIso = slots[18].startTime; // 09:00 VN
      const onSelectStart = vi.fn();
      const onSelectRange = vi.fn();

      // When clicking end slot, now is 08:31:00 VN (09:00 is less than 30m away)
      const expiredNow = new Date('2026-10-25T08:31:00.000+07:00');

      render(
        <TimeGrid
          {...defaultProps}
          slots={slots}
          now={expiredNow}
          selectingStartTime={selectingStartIso}
          onSelectStart={onSelectStart}
          onSelectRange={onSelectRange}
        />,
      );

      const endSlot = screen.getByTestId('time-slot-09:30');
      fireEvent.click(endSlot);

      expect(onSelectRange).not.toHaveBeenCalled();
      expect(onSelectStart).toHaveBeenCalledWith('');
      expect(screen.getByTestId('time-grid-error')).toHaveTextContent(
        'Khung giờ bắt đầu đã quá thời gian đặt trước ít nhất 30 phút. Vui lòng chọn lại.',
      );
    });
  });

  describe('F4: Empty state when no valid 1-hour range is available', () => {
    it('displays notice when all slots are booked', () => {
      const allBookedSlots = createMockDaySlots('2026-10-25').map((s) => ({
        ...s,
        status: 'BOOKED' as const,
      }));

      render(<TimeGrid {...defaultProps} slots={allBookedSlots} />);

      expect(screen.getByTestId('time-grid-no-valid-range')).toBeInTheDocument();
      expect(screen.getByTestId('time-grid-no-valid-range')).toHaveTextContent(
        'Ngày này hiện không còn khoảng giờ trống tối thiểu 1 giờ. Vui lòng chọn ngày khác.',
      );
    });

    it('displays notice when available slots are fragmented into isolated 30-min blocks', () => {
      // Alternating AVAILABLE and BOOKED so no 2 consecutive slots are available
      const fragmentedSlots = createMockDaySlots('2026-10-25').map((s, idx) => ({
        ...s,
        status: (idx % 2 === 0 ? 'AVAILABLE' : 'BOOKED') as 'AVAILABLE' | 'BOOKED',
      }));

      render(<TimeGrid {...defaultProps} slots={fragmentedSlots} />);

      expect(screen.getByTestId('time-grid-no-valid-range')).toBeInTheDocument();
    });

    it('does not display notice when at least one 1-hour range is available', () => {
      render(<TimeGrid {...defaultProps} />);

      expect(screen.queryByTestId('time-grid-no-valid-range')).not.toBeInTheDocument();
    });
  });

  describe('N1 & N3: Dynamic lead-time timer in production without now prop', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('N1: does not overflow 32-bit int or enter infinite loop when viewing dates 45 days in future', () => {
      // Current system time: 2026-10-01 08:00 VN
      vi.setSystemTime(new Date('2026-10-01T08:00:00.000+07:00'));
      // Slots for 45 days later: 2026-11-15
      const futureSlots = createMockDaySlots('2026-11-15');

      const warnSpy = vi.spyOn(console, 'warn');
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      const { unmount } = render(
        <TimeGrid
          slots={futureSlots}
          onSelectStart={vi.fn()}
          onSelectRange={vi.fn()}
        />,
      );

      // Verify no TimeoutOverflowWarning was triggered
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('TimeoutOverflowWarning'));

      // Verify delay was capped at safe max (60 * 60 * 1000 = 3,600,000 ms) and not > 2^31-1
      const calls = setTimeoutSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        const delay = call[1];
        if (typeof delay === 'number') {
          expect(delay).toBeLessThanOrEqual(3600000);
          expect(delay).toBeGreaterThanOrEqual(0);
        }
      }

      unmount();
      warnSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    });

    it('N3: updates slot 09:00 to disabled when mounting at exact 08:30:00 boundary and advancing timers', () => {
      // Current time is exactly 08:30:00.000 VN on 2026-10-25
      vi.setSystemTime(new Date('2026-10-25T08:30:00.000+07:00'));
      const slots = createMockDaySlots('2026-10-25');

      render(
        <TimeGrid
          slots={slots}
          onSelectStart={vi.fn()}
          onSelectRange={vi.fn()}
        />,
      );

      // At exact 08:30:00.000, slot 09:00 has exactly 30 minutes lead time (not past)
      const slot0900 = screen.getByTestId('time-slot-09:00');
      expect(slot0900).not.toBeDisabled();
      expect(slot0900).toHaveClass('slot-available');

      // Advance timers by 100ms (to 08:30:00.100 VN)
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Slot 09:00 now has < 30 minutes lead time -> becomes disabled and slot-past
      expect(slot0900).toBeDisabled();
      expect(slot0900).toHaveClass('slot-past');
    });
  });
});
