import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomOverviewGrid } from '../components/RoomOverviewGrid';
import { DashboardRoomSchedule } from '../types/admin-dashboard';

describe('RoomOverviewGrid operating hours', () => {
  it('shows only operating hours from a full-day API schedule, preserving booking status', () => {
    const dayStart = new Date('2026-10-25T00:00:00+07:00').getTime();
    const room: DashboardRoomSchedule = {
      id: 'room-1',
      name: 'Alpha',
      capacity: 8,
      pricePerHour: '200000.00',
      status: 'AVAILABLE',
      bookings: [],
      slots: Array.from({ length: 48 }, (_, i) => ({
        startTime: new Date(dayStart + i * 30 * 60 * 1000).toISOString(),
        endTime: new Date(dayStart + (i + 1) * 30 * 60 * 1000).toISOString(),
        status: i === 14 ? 'BOOKED' : 'AVAILABLE',
      })),
    };
    render(<RoomOverviewGrid rooms={[room]} date="2026-10-25" />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(31);
    expect(screen.getByRole('columnheader', { name: '07:00' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '21:30' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '06:30' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '22:00' })).not.toBeInTheDocument();
    expect(screen.getByTitle(/Đã đặt:/)).toBeInTheDocument();
    expect(screen.queryByTestId('toggle-full-day-btn')).not.toBeInTheDocument();
  });
});
