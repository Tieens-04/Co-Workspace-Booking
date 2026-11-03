import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevenueSummary } from '../components/admin/bookings/RevenueSummary';
import { AdminRevenueData } from '../types/admin-booking';

const data = (startDate: string | null, endDate: string | null): AdminRevenueData =>
  ({
    period: { startDate, endDate },
    actualRevenue: '100000.00',
    potentialRevenue: '150000.00',
    unpaidRevenue: '50000.00',
    totalBookings: 2,
    paidBookings: 1,
    unpaidBookings: 1,
  }) as AdminRevenueData;

describe('RevenueSummary period caption (CWB-57)', () => {
  it('shows the server-resolved period (default last 90 days)', () => {
    render(<RevenueSummary data={data('2026-08-06', '2026-11-03')} error={null} />);
    expect(screen.getByTestId('revenue-period')).toHaveTextContent(
      'Doanh thu từ 06/08/2026 đến 03/11/2026',
    );
  });

  it('shows a single day when the period is one date', () => {
    render(<RevenueSummary data={data('2026-11-03', '2026-11-03')} error={null} />);
    expect(screen.getByTestId('revenue-period')).toHaveTextContent('Doanh thu ngày 03/11/2026');
  });

  it('omits the caption when the server sends no period', () => {
    render(<RevenueSummary data={data(null, null)} error={null} />);
    expect(screen.queryByTestId('revenue-period')).not.toBeInTheDocument();
  });
});
