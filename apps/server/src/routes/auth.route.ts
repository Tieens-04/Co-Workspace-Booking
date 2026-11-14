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
  loginEmailRateLimiter,
  loginIpRateLimiter,
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
  // Broadest first, then IP + email, then email: a request already blocked by one limiter is
  // given back by the earlier ones and never reaches the later ones, so a single client cannot
  // inflate a shared (per-email / per-IP) counter. Whichever limiter blocks writes the last
  // `RateLimit-*` headers.
  loginIpRateLimiter,
  loginRateLimiter,
  loginEmailRateLimiter,
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
