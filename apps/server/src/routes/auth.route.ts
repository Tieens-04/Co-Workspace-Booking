import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';
import {
  loginRateLimiter,
  resetLoginRateLimitOnSuccess,
} from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.post('/register', validateBody(registerSchema), authController.register);
router.post(
  '/login',
  validateBody(loginSchema),
  resetLoginRateLimitOnSuccess,
  loginRateLimiter,
  authController.login,
);

export default router;
