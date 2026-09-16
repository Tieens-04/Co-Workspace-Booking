import { Router } from 'express';
import { Role } from '@prisma/client';
import healthRouter from './health.route.js';
import authRouter from './auth.route.js';
import adminRouter from './admin.route.js';
import meRouter from './me.route.js';
import { verifyToken, checkRole } from '../middlewares/auth.middleware.js';

const apiRouter = Router();

// Gắn các feature routes tại đây
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

// Protected routes
apiRouter.use('/admin', verifyToken, checkRole([Role.ADMIN]), adminRouter);
apiRouter.use('/me', verifyToken, meRouter);

export default apiRouter;
