import { Request, Response, NextFunction } from 'express';
import { authService, AuthService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.util.js';
import { passwordResetService, PasswordResetService } from '../services/password-reset.service.js';
import {
  emailVerificationService,
  EmailVerificationService,
} from '../services/email-verification.service.js';

export class AuthController {
  constructor(
    private readonly service: AuthService = authService,
    private readonly resetService: PasswordResetService = passwordResetService,
    private readonly verificationService: EmailVerificationService = emailVerificationService,
  ) {}

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.verificationService.verifyEmail(req.body.token);
      return sendSuccess(res, null, 'Xác thực email thành công. Bạn đã có thể đặt phòng.');
    } catch (err) {
      return next(err);
    }
  };

  resendVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.verificationService.resendVerification(req.user!.sub);
      return sendSuccess(
        res,
        null,
        'Nếu tài khoản chưa xác thực, email xác thực mới đã được gửi. Vui lòng kiểm tra hộp thư.',
      );
    } catch (err) {
      return next(err);
    }
  };

  forgotPassword = (req: Request, res: Response) => {
    // Same response whether or not the email exists (no account enumeration).
    this.resetService.requestReset(req.body.email);
    return sendSuccess(
      res,
      null,
      'Nếu email đã đăng ký, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.',
    );
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.resetService.resetPassword(req.body.token, req.body.newPassword);
      return sendSuccess(res, null, 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.');
    } catch (err) {
      return next(err);
    }
  };

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
