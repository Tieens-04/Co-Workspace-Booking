import { Router } from 'express';
import { Role } from '@prisma/client';
import healthRouter from './health.route.js';
import authRouter from './auth.route.js';
import roomRouter from './room.route.js';
import amenityRouter from './amenity.route.js';
import adminRouter from './admin.route.js';
import meRouter from './me.route.js';
import bookingRouter from './booking.route.js';
import { verifyToken, checkRole } from '../middlewares/auth.middleware.js';

const apiRouter = Router();

// Gắn các feature routes tại đây
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/rooms', roomRouter);
apiRouter.use('/amenities', amenityRouter);

// Protected routes
apiRouter.use('/admin', verifyToken, checkRole([Role.ADMIN]), adminRouter);
apiRouter.use('/me', verifyToken, meRouter);
apiRouter.use('/bookings', verifyToken, checkRole([Role.CUSTOMER]), bookingRouter);

export default apiRouter;
