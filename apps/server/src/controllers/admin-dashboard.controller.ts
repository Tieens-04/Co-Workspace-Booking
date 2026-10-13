import { Request, Response, NextFunction } from 'express';
import {
  adminDashboardService,
  AdminDashboardService,
} from '../services/admin-dashboard.service.js';
import { sendSuccess } from '../utils/response.util.js';
import {
  GetDashboardKpiQuery,
  GetDashboardScheduleQuery,
} from '../validators/admin-dashboard.validator.js';

export class AdminDashboardController {
  constructor(
    private readonly service: AdminDashboardService = adminDashboardService,
  ) {}

  getKpi = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as GetDashboardKpiQuery;
      const data = await this.service.getDashboardKpi(query);
      return sendSuccess(res, data, 'Lấy dữ liệu KPI dashboard thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  getSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as GetDashboardScheduleQuery;
      const data = await this.service.getDashboardSchedule(query);
      return sendSuccess(res, data, 'Lấy lịch time-grid phòng làm việc thành công', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const adminDashboardController = new AdminDashboardController();
