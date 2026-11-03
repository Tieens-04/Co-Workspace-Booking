import { Request, Response, NextFunction } from 'express';
import { emailOutboxService, EmailOutboxService } from '../services/email-outbox.service.js';
import { sendSuccess } from '../utils/response.util.js';
import {
  EmailOutboxIdParamsInput,
  GetEmailOutboxQueryInput,
} from '../validators/admin-email-outbox.validator.js';

export class AdminEmailOutboxController {
  constructor(private readonly service: EmailOutboxService = emailOutboxService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as GetEmailOutboxQueryInput;
      const data = await this.service.list(query);
      return sendSuccess(res, data, 'Lấy danh sách email thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  retry = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as unknown as EmailOutboxIdParamsInput;
      const data = await this.service.retry(id);
      return sendSuccess(res, data, 'Đã đưa email vào hàng đợi gửi lại', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const adminEmailOutboxController = new AdminEmailOutboxController();
