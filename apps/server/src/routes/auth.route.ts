import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from '../validators/auth.validator.js';
import {
  loginRateLimiter,
  resetLoginRateLimitOnSuccess,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
  registerRateLimiter,
  verifyEmailRateLimiter,
  resendVerificationRateLimiter,
} from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.post(
  '/register',
  registerRateLimiter,
  validateBody(registerSchema),
  authController.register,
);
router.post(
  '/login',
  validateBody(loginSchema),
  resetLoginRateLimitOnSuccess,
  loginRateLimiter,
  authController.login,
);

router.post(
  '/forgot-password',
  forgotPasswordRateLimiter,
  validateBody(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  resetPasswordRateLimiter,
  authController.resetPassword,
);

router.post(
  '/verify-email',
  verifyEmailRateLimiter,
  validateBody(verifyEmailSchema, {
    errorCode: 'INVALID_VERIFICATION_TOKEN',
    message: 'Liên kết xác thực không hợp lệ hoặc đã hết hạn',
  }),
  authController.verifyEmail,
);

router.post(
  '/resend-verification',
  verifyToken,
  resendVerificationRateLimiter,
  validateBody(resendVerificationSchema),
  authController.resendVerification,
);

export default router;
