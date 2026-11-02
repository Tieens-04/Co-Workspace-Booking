import { Request, Response, NextFunction } from 'express';
import { adminReportService, AdminReportService } from '../services/admin-report.service.js';
import type { ExportReportQueryInput } from '../validators/admin-booking.validator.js';

const sendCsv = (res: Response, name: string, query: ExportReportQueryInput, body: string) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${name}_${query.startDate}_${query.endDate}.csv"`,
  );
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(body);
};

export class AdminReportController {
  constructor(private readonly service: AdminReportService = adminReportService) {}

  bookings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as ExportReportQueryInput;
      return sendCsv(res, 'bookings', query, await this.service.bookingsCsv(query));
    } catch (err) {
      return next(err);
    }
  };

  revenue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as ExportReportQueryInput;
      return sendCsv(res, 'revenue', query, await this.service.revenueCsv(query));
    } catch (err) {
      return next(err);
    }
  };
}

export const adminReportController = new AdminReportController();
