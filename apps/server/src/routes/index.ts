import { Router } from 'express';
import healthRouter from './health.route.js';

const apiRouter = Router();

// Gắn các feature routes tại đây
apiRouter.use('/health', healthRouter);

export default apiRouter;
