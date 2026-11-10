import { Request, Response, NextFunction } from 'express';
import { meService, MeService } from '../services/me.service.js';
import { sendSuccess } from '../utils/response.util.js';

export class MeController {
  constructor(private readonly service: MeService = meService) {}

  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.service.getProfile(req.user!.sub);
      return sendSuccess(res, user, 'Lấy thông tin tài khoản thành công');
    } catch (err) {
      return next(err);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.service.updateProfile(req.user!.sub, req.body);
      return sendSuccess(res, user, 'Cập nhật thông tin tài khoản thành công');
    } catch (err) {
      return next(err);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.changePassword(req.user!.sub, req.body);
      return sendSuccess(res, result, 'Đổi mật khẩu thành công');
    } catch (err) {
      return next(err);
    }
  };

  logoutAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.logoutAll(req.user!.sub);
      return sendSuccess(res, null, 'Đã đăng xuất khỏi mọi thiết bị');
    } catch (err) {
      return next(err);
    }
  };

  deleteAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.deleteAccount(req.user!.sub, req.body);
      return sendSuccess(res, null, 'Tài khoản đã được xóa');
    } catch (err) {
      return next(err);
    }
  };
}

export const meController = new MeController();
