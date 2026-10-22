import type * as React from 'react';
import { CircleAlert, Hourglass, Sigma, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AdminRevenueData } from '../../../types/admin-booking';
import { formatCurrency } from '../../../utils/format';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface RevenueFigureProps {
  icon: LucideIcon;
  label: React.ReactNode;
  value: string;
  valueTestId: string;
  meta: React.ReactNode;
}

function RevenueFigure({ icon: Icon, label, value, valueTestId, meta }: RevenueFigureProps) {
  return (
    <div className="grid content-start gap-2 p-5">
      <p className="eyebrow flex items-center gap-1.5 text-[0.6875rem]">
        <Icon aria-hidden="true" className="size-3.5 text-primary" strokeWidth={1.75} />
        {label}
      </p>
      <strong
        data-testid={valueTestId}
        className="text-[1.5rem] leading-tight font-bold tracking-[-0.02em] tabular-nums sm:text-[1.75rem]"
      >
        {value}
      </strong>
      <p className="text-[0.8125rem] text-muted-foreground tabular-nums">{meta}</p>
    </div>
  );
}

interface RevenueSummaryProps {
  data: AdminRevenueData | null;
  error: string | null;
}

/**
 * Paid revenue first, unpaid separately, booked total last. Actual revenue counts only paid
 * bookings; the figures come straight from the server.
 */
export function RevenueSummary({ data, error }: RevenueSummaryProps) {
  return (
    <>
      {error && (
        <Alert variant="destructive" data-testid="revenue-error-message">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {data && (
        <section
          aria-label="Tổng quan doanh thu"
          data-testid="revenue-summary-card"
          className="grid divide-y rounded-xl border bg-card md:grid-cols-3 md:divide-x md:divide-y-0"
        >
          <RevenueFigure
            icon={Wallet}
            label="Doanh thu thực tế (Đã thanh toán)"
            value={formatCurrency(data.actualRevenue)}
            valueTestId="actual-revenue"
            meta={<span>Đã thanh toán: {data.paidBookings} đơn</span>}
          />
          <RevenueFigure
            icon={Hourglass}
            label="Chưa thanh toán"
            value={formatCurrency(data.unpaidRevenue)}
            valueTestId="unpaid-revenue"
            meta={<span>Chưa thanh toán: {data.unpaidBookings} đơn</span>}
          />
          <RevenueFigure
            icon={Sigma}
            label="Doanh thu tạm tính (Tổng đã đặt)"
            value={formatCurrency(data.potentialRevenue)}
            valueTestId="potential-revenue"
            meta="Gồm cả đơn chưa thanh toán"
          />
        </section>
      )}
    </>
  );
}
