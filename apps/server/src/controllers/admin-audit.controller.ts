import { Request, Response, NextFunction } from 'express';
import { adminAuditService, AdminAuditService } from '../services/admin-audit.service.js';
import { sendSuccess } from '../utils/response.util.js';
import { GetAuditEventsQueryInput } from '../validators/admin-audit.validator.js';

export class AdminAuditController {
  constructor(private readonly service: AdminAuditService = adminAuditService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as GetAuditEventsQueryInput;
      const data = await this.service.getAuditEvents(query);
      return sendSuccess(res, data, 'Lấy lịch sử thao tác thành công', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const adminAuditController = new AdminAuditController();
