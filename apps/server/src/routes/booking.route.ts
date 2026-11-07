import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller.js';
import { validateBody, validateQuery, validateParams } from '../middlewares/validate.middleware.js';
import {
  createBookingSchema,
  getBookingsQuerySchema,
  getBookingByIdParamsSchema,
  getBookingByIdQuerySchema,
  cancelBookingParamsSchema,
  cancelBookingQuerySchema,
  cancelBookingBodySchema,
  rescheduleBookingParamsSchema,
  rescheduleBookingQuerySchema,
  rescheduleBookingBodySchema,
} from '../validators/booking.validator.js';
import { createBookingRateLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.get('/', validateQuery(getBookingsQuerySchema), bookingController.getBookings);
router.get(
  '/:id',
  validateParams(getBookingByIdParamsSchema),
  validateQuery(getBookingByIdQuerySchema),
  bookingController.getBookingById,
);
// verifyToken runs where this router is mounted, so the limiter keys on the verified user id.
router.post(
  '/',
  createBookingRateLimiter,
  validateBody(createBookingSchema),
  bookingController.createBooking,
);
router.patch(
  '/:id',
  createBookingRateLimiter,
  validateParams(rescheduleBookingParamsSchema),
  validateQuery(rescheduleBookingQuerySchema),
  validateBody(rescheduleBookingBodySchema),
  bookingController.rescheduleBooking,
);
router.patch(
  '/:id/cancel',
  validateParams(cancelBookingParamsSchema),
  validateQuery(cancelBookingQuerySchema),
  validateBody(cancelBookingBodySchema),
  bookingController.cancelBooking,
);

export default router;
