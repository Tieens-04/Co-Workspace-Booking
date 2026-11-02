import { Router } from 'express';
import { meController } from '../controllers/me.controller.js';
import { validateBody, validateQuery } from '../middlewares/validate.middleware.js';
import { changePasswordRateLimiter } from '../middlewares/rate-limit.middleware.js';
import {
  changePasswordBodySchema,
  meQuerySchema,
  updateMeBodySchema,
} from '../validators/me.validator.js';

// Mounted behind verifyToken; every handler acts on the account from the verified JWT only.
const router = Router();

router.get('/', validateQuery(meQuerySchema), meController.getProfile);
router.patch(
  '/',
  validateQuery(meQuerySchema),
  validateBody(updateMeBodySchema),
  meController.updateProfile,
);
router.post(
  '/password',
  validateQuery(meQuerySchema),
  validateBody(changePasswordBodySchema),
  changePasswordRateLimiter,
  meController.changePassword,
);

export default router;
