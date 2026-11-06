import { Request, Response, NextFunction } from 'express';
import { adminUserService, AdminUserService } from '../services/admin-user.service.js';
import { sendSuccess } from '../utils/response.util.js';
import { auditActorOf } from '../utils/audit-actor.util.js';
import {
  AdminUserIdParamsInput,
  GetAdminUsersQueryInput,
  UpdateUserStatusBodyInput,
} from '../validators/admin-user.validator.js';

export class AdminUserController {
  constructor(private readonly service: AdminUserService = adminUserService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as GetAdminUsersQueryInput;
      const data = await this.service.list(query);
      return sendSuccess(res, data, 'Lấy danh sách tài khoản thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as unknown as AdminUserIdParamsInput;
      const { status, reason } = req.body as UpdateUserStatusBodyInput;
      const data = await this.service.updateStatus(id, status, reason, auditActorOf(req));
      const message = status === 'LOCKED' ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản';
      return sendSuccess(res, data, message, 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const adminUserController = new AdminUserController();
