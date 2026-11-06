import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';
import {
  loginRateLimiter,
  resetLoginRateLimitOnSuccess,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
  registerRateLimiter,
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

export default router;
