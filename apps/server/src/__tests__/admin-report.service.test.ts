import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { AdminReportService, MAX_EXPORT_ROWS } from '../services/admin-report.service.js';
import { bookingRepository } from '../repositories/booking.repository.js';

const BOM = String.fromCharCode(0xfeff);

const database = vi.hoisted(() => ({
  booking: { findMany: vi.fn() },
}));

vi.mock('../utils/prisma.util.js', () => ({
  default: database,
  prisma: database,
}));

const makeRow = (overrides: {
  bookingCode: string;
  startTime: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalAmount: string;
  refundedAmount?: string;
  paymentMethod?: PaymentMethod | null;
}) => {
  const start = new Date(overrides.startTime);
  return {
    bookingCode: overrides.bookingCode,
    startTime: start,
    endTime: new Date(start.getTime() + 2 * 3_600_000),
    status: overrides.status,
    paymentStatus: overrides.paymentStatus,
    paymentMethod: overrides.paymentMethod ?? null,
    totalAmount: new Prisma.Decimal(overrides.totalAmount),
    refundedAmount: new Prisma.Decimal(overrides.refundedAmount ?? '0.00'),
    guestName: 'Khách',
    room: { name: 'Phòng A' },
    user: null,
  };
};

describe('AdminReportService.revenueCsv (CWB-123)', () => {
  const service = new AdminReportService();

  beforeEach(() => {
    vi.restoreAllMocks();
    database.booking.findMany.mockReset();
    vi.spyOn(bookingRepository, 'evaluateNoShowBookings').mockResolvedValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups bookings by Vietnam day (UTC+7) in ascending order with exact totals and refund rules', async () => {
    database.booking.findMany.mockResolvedValue([
      // 2031-03-09 23:30 VN (UTC+7) -> 2031-03-09
      makeRow({
        bookingCode: 'CS-1',
        startTime: '2031-03-09T16:30:00Z',
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.CASH,
        totalAmount: '50000.00',
      }),
      // 2031-03-10 00:00 VN (UTC+7) -> 2031-03-10
      makeRow({
        bookingCode: 'CS-2',
        startTime: '2031-03-09T17:00:00Z',
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.CASH,
        totalAmount: '200000.00',
      }),
      makeRow({
        bookingCode: 'CS-3',
        startTime: '2031-03-10T03:00:00Z',
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: '150000.00',
      }),
      makeRow({
        bookingCode: 'CS-4',
        startTime: '2031-03-10T05:00:00Z',
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: '90000.00',
      }),
      makeRow({
        bookingCode: 'CS-5',
        startTime: '2031-03-11T02:00:00Z',
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
        paymentMethod: PaymentMethod.QR,
        totalAmount: '200000.00',
        refundedAmount: '50000.00',
      }),
      makeRow({
        bookingCode: 'CS-6',
        startTime: '2031-03-11T04:00:00Z',
        status: BookingStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED,
        paymentMethod: PaymentMethod.CASH,
        totalAmount: '100000.00',
        refundedAmount: '100000.00',
      }),
    ]);

    const csv = await service.revenueCsv({
      startDate: '2031-03-09',
      endDate: '2031-03-11',
    });

    expect(database.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        take: MAX_EXPORT_ROWS + 1,
      }),
    );

    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.replace(BOM, '').trim().split('\r\n');
    expect(lines).toEqual([
      'Ngày (giờ VN),Tổng đơn,Đã thanh toán,Chưa thanh toán,Đã hủy,Doanh thu thực tế,Chưa thu,Doanh thu tiềm năng',
      '2031-03-09,1,1,0,0,50000.00,0.00,50000.00',
      '2031-03-10,3,1,1,1,200000.00,150000.00,350000.00',
      '2031-03-11,2,1,0,2,150000.00,0.00,150000.00',
      'Tổng,6,3,1,3,400000.00,150000.00,550000.00',
    ]);
  });

  it('outputs header and zeroed total row when no bookings match', async () => {
    database.booking.findMany.mockResolvedValue([]);

    const csv = await service.revenueCsv({
      startDate: '2031-03-10',
      endDate: '2031-03-10',
    });

    const lines = csv.replace(BOM, '').trim().split('\r\n');
    expect(lines).toEqual([
      'Ngày (giờ VN),Tổng đơn,Đã thanh toán,Chưa thanh toán,Đã hủy,Doanh thu thực tế,Chưa thu,Doanh thu tiềm năng',
      'Tổng,0,0,0,0,0.00,0.00,0.00',
    ]);
  });

  it('rejects exports exceeding MAX_EXPORT_ROWS with 400 EXPORT_TOO_LARGE', async () => {
    const templateRow = makeRow({
      bookingCode: 'CS-OVER',
      startTime: '2031-03-10T02:00:00Z',
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      totalAmount: '100000.00',
    });
    database.booking.findMany.mockResolvedValue(
      Array.from({ length: MAX_EXPORT_ROWS + 1 }, () => templateRow),
    );

    await expect(
      service.revenueCsv({ startDate: '2031-03-10', endDate: '2031-03-10' }),
    ).rejects.toMatchObject({
      code: 'EXPORT_TOO_LARGE',
      statusCode: 400,
    });
  });

  it('aggregates MAX_EXPORT_ROWS (10,000) single-day rows in O(n) without copying day arrays per row', async () => {
    const paidRow = makeRow({
      bookingCode: 'CS-PAID',
      startTime: '2031-03-10T02:00:00Z',
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.CASH,
      totalAmount: '100000.00',
    });
    const unpaidRow = makeRow({
      bookingCode: 'CS-UNPAID',
      startTime: '2031-03-10T04:00:00Z',
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,
      totalAmount: '50000.00',
    });
    database.booking.findMany.mockResolvedValue(
      Array.from({ length: MAX_EXPORT_ROWS }, (_, index) =>
        index % 2 === 0 ? paidRow : unpaidRow,
      ),
    );

    const mapSetSpy = vi.spyOn(Map.prototype, 'set');
    let csv: string;
    let dayBucketSetCalls: number;
    try {
      csv = await service.revenueCsv({
        startDate: '2031-03-10',
        endDate: '2031-03-10',
      });
      dayBucketSetCalls = mapSetSpy.mock.calls.filter(
        ([key, value]) => key === '2031-03-10' && Array.isArray(value),
      ).length;
    } finally {
      mapSetSpy.mockRestore();
    }

    // O(n) grouping creates one bucket per distinct day instead of re-setting a cloned array 10,000 times.
    expect(dayBucketSetCalls).toBe(1);

    const lines = csv.replace(BOM, '').trim().split('\r\n');
    expect(lines).toEqual([
      'Ngày (giờ VN),Tổng đơn,Đã thanh toán,Chưa thanh toán,Đã hủy,Doanh thu thực tế,Chưa thu,Doanh thu tiềm năng',
      '2031-03-10,10000,5000,5000,0,500000000.00,250000000.00,750000000.00',
      'Tổng,10000,5000,5000,0,500000000.00,250000000.00,750000000.00',
    ]);
  });
});
