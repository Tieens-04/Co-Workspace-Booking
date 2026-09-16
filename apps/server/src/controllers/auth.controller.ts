import { Request, Response, NextFunction } from 'express';
import { authService, AuthService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.util.js';

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.service.register(req.body);
      return sendSuccess(res, user, 'Đăng ký tài khoản thành công', 201);
    } catch (err) {
      return next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.login(req.body);
      return sendSuccess(res, result, 'Đăng nhập thành công', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const authController = new AuthController();
