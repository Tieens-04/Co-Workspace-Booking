import { Router } from 'express';
import { meController } from '../controllers/me.controller.js';
import { validateBody, validateQuery } from '../middlewares/validate.middleware.js';
import { changePasswordRateLimiter } from '../middlewares/rate-limit.middleware.js';
import {
  changePasswordBodySchema,
  deleteAccountBodySchema,
  logoutAllBodySchema,
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
// CWB-77: revokes every token of the account (this device included).
router.post(
  '/logout-all',
  validateQuery(meQuerySchema),
  validateBody(logoutAllBodySchema),
  meController.logoutAll,
);
// CWB-88: anonymizes the account. Shares the per-account wrong-password budget with /password.
router.post(
  '/deletion',
  validateQuery(meQuerySchema),
  validateBody(deleteAccountBodySchema),
  changePasswordRateLimiter,
  meController.deleteAccount,
);

export default router;
