import { Router } from 'express';
import { HealthController } from '../controllers/health.controller.js';

const router = Router();
router.get('/', HealthController.checkHealth);
router.get('/liveness', HealthController.checkLiveness);

export default router;
