import { Router } from 'express';
import healthRouter from './health.route.js';
import authRouter from './auth.route.js';

const apiRouter = Router();

// Gắn các feature routes tại đây
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

export default apiRouter;
