import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportExport } from '../components/admin/bookings/ReportExport';
import { adminReportApi, saveBlob } from '../services/admin-report.api';

vi.mock('../services/admin-report.api', () => ({
  adminReportApi: { download: vi.fn() },
  saveBlob: vi.fn(),
}));

const setDates = (start: string, end: string) => {
  fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: start } });
  fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: end } });
};

describe('ReportExport (CWB-69)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads the bookings CSV for the chosen period and payment filter', async () => {
    const user = userEvent.setup();
    const blob = new Blob(['csv']);
    vi.mocked(adminReportApi.download).mockResolvedValue(blob);
    render(<ReportExport />);

    setDates('2031-03-01', '2031-03-31');
    await user.selectOptions(screen.getByLabelText('Thanh toán'), 'PAID');
    await user.click(screen.getByRole('button', { name: 'Xuất danh sách đơn' }));

    expect(adminReportApi.download).toHaveBeenCalledWith('bookings', {
      startDate: '2031-03-01',
      endDate: '2031-03-31',
      paymentStatus: 'PAID',
    });
    expect(saveBlob).toHaveBeenCalledWith(blob, 'bookings_2031-03-01_2031-03-31.csv');
  });

  it('downloads daily revenue without a payment filter by default', async () => {
    const user = userEvent.setup();
    vi.mocked(adminReportApi.download).mockResolvedValue(new Blob(['csv']));
    render(<ReportExport />);

    setDates('2031-03-01', '2031-03-02');
    await user.click(screen.getByRole('button', { name: 'Xuất doanh thu theo ngày' }));

    expect(adminReportApi.download).toHaveBeenCalledWith('revenue', {
      startDate: '2031-03-01',
      endDate: '2031-03-02',
    });
  });

  it.each([
    ['2031-03-10', '2031-03-01', 'không được sau'],
    ['2031-01-01', '2031-04-30', 'tối đa 92 ngày'],
  ])('validates the period %s..%s before calling the API', async (start, end, message) => {
    const user = userEvent.setup();
    render(<ReportExport />);

    setDates(start, end);
    await user.click(screen.getByRole('button', { name: 'Xuất danh sách đơn' }));

    expect(screen.getByTestId('report-export-error')).toHaveTextContent(message);
    expect(adminReportApi.download).not.toHaveBeenCalled();
  });

  it('shows the server message carried in a blob error response', async () => {
    const user = userEvent.setup();
    vi.mocked(adminReportApi.download).mockRejectedValue({
      response: {
        status: 400,
        data: new Blob([JSON.stringify({ message: 'Kết quả vượt quá 10000 dòng.' })], {
          type: 'application/json',
        }),
      },
    });
    render(<ReportExport />);

    setDates('2031-03-01', '2031-03-31');
    await user.click(screen.getByRole('button', { name: 'Xuất danh sách đơn' }));

    expect(await screen.findByTestId('report-export-error')).toHaveTextContent(
      'Kết quả vượt quá 10000 dòng.',
    );
    expect(saveBlob).not.toHaveBeenCalled();
  });
});
