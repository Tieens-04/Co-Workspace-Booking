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

  it('displays CLOSED slots with closed legend item and tooltip (CWB-86)', () => {
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
        status: i === 18 ? 'CLOSED' : 'AVAILABLE',
      })),
    };
    render(<RoomOverviewGrid rooms={[room]} date="2026-10-25" />);
    const closedLegend = screen.getByText('Đóng cửa');
    expect(closedLegend).toBeInTheDocument();
    const closedSwatch = closedLegend.querySelector('span');
    expect(closedSwatch).toHaveClass('bg-status-warning-bg', 'border-status-warning-border');

    const closedCell = screen.getByTitle(/Đóng cửa: 09:00 - 09:30/);
    expect(closedCell).toBeInTheDocument();
    expect(closedCell).toHaveAttribute('title', 'Đóng cửa: 09:00 - 09:30');
    expect(closedCell.firstElementChild).toHaveClass(
      'bg-status-warning-bg',
      'border-status-warning-border',
    );
  });

  it('includes closure reason in CLOSED and overlapping BOOKED slot tooltips (CWB-116)', () => {
    const dayStart = new Date('2026-10-25T00:00:00+07:00').getTime();
    const room: DashboardRoomSchedule = {
      id: 'room-1',
      name: 'Alpha',
      capacity: 8,
      pricePerHour: '200000.00',
      status: 'AVAILABLE',
      bookings: [
        {
          id: 'b-1',
          bookingCode: 'CS-20261025-ABCD',
          startTime: new Date('2026-10-25T10:00:00+07:00').toISOString(),
          endTime: new Date('2026-10-25T11:00:00+07:00').toISOString(),
          status: 'CONFIRMED',
          customerName: 'Nguyễn Văn A',
        },
      ],
      slots: Array.from({ length: 48 }, (_, i) => {
        if (i === 18) {
          return {
            startTime: new Date(dayStart + i * 30 * 60 * 1000).toISOString(),
            endTime: new Date(dayStart + (i + 1) * 30 * 60 * 1000).toISOString(),
            status: 'CLOSED' as const,
            reason: 'Bảo trì hệ thống điện',
          };
        }
        if (i === 20 || i === 21) {
          return {
            startTime: new Date(dayStart + i * 30 * 60 * 1000).toISOString(),
            endTime: new Date(dayStart + (i + 1) * 30 * 60 * 1000).toISOString(),
            status: 'BOOKED' as const,
            reason: 'Sửa phòng đột xuất',
          };
        }
        return {
          startTime: new Date(dayStart + i * 30 * 60 * 1000).toISOString(),
          endTime: new Date(dayStart + (i + 1) * 30 * 60 * 1000).toISOString(),
          status: 'AVAILABLE' as const,
        };
      }),
    };

    render(<RoomOverviewGrid rooms={[room]} date="2026-10-25" />);

    const closedCell = screen.getByTitle('Đóng cửa: 09:00 - 09:30 (Bảo trì hệ thống điện)');
    expect(closedCell).toBeInTheDocument();

    const bookedCells = screen.getAllByTitle(
      'Đã đặt: Nguyễn Văn A (CS-20261025-ABCD) — Đóng cửa: Sửa phòng đột xuất',
    );
    expect(bookedCells).toHaveLength(2);
    expect(bookedCells[0].firstElementChild).toHaveClass('bg-primary');
  });

  it('synthesizes 07:00-22:00 axis from date when all rooms on the page are MAINTENANCE (CWB-116)', () => {
    const maintenanceRooms: DashboardRoomSchedule[] = [
      {
        id: 'room-m1',
        name: 'Maintenance One',
        capacity: 10,
        pricePerHour: '300000.00',
        status: 'MAINTENANCE',
        slots: [],
        bookings: [],
      },
      {
        id: 'room-m2',
        name: 'Maintenance Two',
        capacity: 12,
        pricePerHour: '400000.00',
        status: 'MAINTENANCE',
        slots: [],
        bookings: [],
      },
    ];

    const { container } = render(<RoomOverviewGrid rooms={maintenanceRooms} date="2026-10-25" />);

    expect(screen.getAllByRole('columnheader')).toHaveLength(31);
    expect(screen.getByRole('columnheader', { name: '07:00' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '21:30' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '06:30' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '22:00' })).not.toBeInTheDocument();

    const maintenanceCells = screen.getAllByText('Phòng đang bảo trì - Không khả dụng');
    expect(maintenanceCells).toHaveLength(2);
    for (const span of maintenanceCells) {
      expect(span.closest('td')).toHaveAttribute('colspan', '30');
    }
    expect(container.querySelector('td[colspan="0"]')).toBeNull();
  });
});
