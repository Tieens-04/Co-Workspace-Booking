import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { createBookingSchema } from '../validators/booking.validator.js';

const router = Router();

router.post('/', validateBody(createBookingSchema), bookingController.createBooking);

export default router;
