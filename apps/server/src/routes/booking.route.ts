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
} from '../validators/booking.validator.js';

const router = Router();

router.get('/', validateQuery(getBookingsQuerySchema), bookingController.getBookings);
router.get(
  '/:id',
  validateParams(getBookingByIdParamsSchema),
  validateQuery(getBookingByIdQuerySchema),
  bookingController.getBookingById,
);
router.post('/', validateBody(createBookingSchema), bookingController.createBooking);
router.patch(
  '/:id/cancel',
  validateParams(cancelBookingParamsSchema),
  validateQuery(cancelBookingQuerySchema),
  validateBody(cancelBookingBodySchema),
  bookingController.cancelBooking,
);

export default router;
