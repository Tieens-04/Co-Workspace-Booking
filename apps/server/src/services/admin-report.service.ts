import { PaymentStatus, Prisma } from '@prisma/client';
import prisma from '../utils/prisma.util.js';
import { AppError } from '../utils/error.util.js';
import { toCsv } from '../utils/csv.util.js';
import { getDayBounds } from '../utils/room-availability.util.js';
import { summarizeBookingRevenue } from '../utils/booking-revenue.util.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import type { ExportReportQueryInput } from '../validators/admin-booking.validator.js';

export const MAX_EXPORT_ROWS = 10_000;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

const vnDateTime = (date: Date) =>
  new Date(date.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
const vnDate = (date: Date) => vnDateTime(date).slice(0, 10);

/** ADMIN CSV exports (CWB-69): bounded period and row count, Vietnam time, same money rules. */
export class AdminReportService {
  private async loadBookings(query: ExportReportQueryInput) {
    // Same lazy no-show evaluation as the admin list so exported statuses match the UI.
    const from = getDayBounds(query.startDate).dayStart;
    const to = getDayBounds(query.endDate).dayEnd;
    // CWB-57: scoped to the exported period/room, like every other bounded report.
    await bookingRepository.evaluateNoShowBookings(new Date(), undefined, undefined, {
      from,
      to,
      roomId: query.roomId,
    });
    const where: Prisma.BookingWhereInput = {
      startTime: { gte: from, lt: to },
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as PaymentStatus } : {}),
    };
    const rows = await prisma.booking.findMany({
      where,
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      take: MAX_EXPORT_ROWS + 1,
      select: {
        bookingCode: true,
        startTime: true,
        endTime: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        totalAmount: true,
        refundedAmount: true,
        guestName: true,
        room: { select: { name: true } },
        user: { select: { fullName: true } },
      },
    });
    if (rows.length > MAX_EXPORT_ROWS) {
      throw new AppError(
        'EXPORT_TOO_LARGE',
        `Kết quả vượt quá ${MAX_EXPORT_ROWS} dòng. Hãy thu hẹp kỳ hoặc thêm bộ lọc.`,
        400,
      );
    }
    return rows;
  }

  async bookingsCsv(query: ExportReportQueryInput): Promise<string> {
    const rows = await this.loadBookings(query);
    return toCsv([
      [
        'Mã đặt phòng',
        'Phòng',
        'Khách hàng',
        'Loại khách',
        'Bắt đầu (giờ VN)',
        'Kết thúc (giờ VN)',
        'Trạng thái',
        'Thanh toán',
        'Phương thức',
        'Số tiền (VND)',
        'Đã hoàn (VND)',
      ],
      ...rows.map((b) => [
        b.bookingCode,
        b.room.name,
        b.user?.fullName ?? b.guestName ?? '',
        b.user ? 'Tài khoản' : 'Vãng lai',
        vnDateTime(b.startTime),
        vnDateTime(b.endTime),
        b.status,
        b.paymentStatus,
        b.paymentMethod ?? '',
        b.totalAmount.toFixed(2),
        b.refundedAmount.toFixed(2),
      ]),
    ]);
  }

  async revenueCsv(query: ExportReportQueryInput): Promise<string> {
    const rows = await this.loadBookings(query);
    const byDay = new Map<string, typeof rows>();
    for (const row of rows) {
      const day = vnDate(row.startTime);
      byDay.set(day, [...(byDay.get(day) ?? []), row]);
    }
    const line = (label: string, items: typeof rows) => {
      const summary = summarizeBookingRevenue(items);
      return [
        label,
        items.length,
        summary.paidBookings,
        summary.unpaidBookings,
        summary.cancelledBookings,
        summary.actualRevenue,
        summary.unpaidRevenue,
        summary.potentialRevenue,
      ];
    };
    return toCsv([
      [
        'Ngày (giờ VN)',
        'Tổng đơn',
        'Đã thanh toán',
        'Chưa thanh toán',
        'Đã hủy',
        'Doanh thu thực tế',
        'Chưa thu',
        'Doanh thu tiềm năng',
      ],
      ...[...byDay.entries()].map(([day, items]) => line(day, items)),
      line('Tổng', rows),
    ]);
  }
}

export const adminReportService = new AdminReportService();
