import { Router } from 'express';
import { adminRoomController } from '../controllers/admin-room.controller.js';
import { adminRoomImageController } from '../controllers/admin-room-image.controller.js';
import { adminBookingController } from '../controllers/admin-booking.controller.js';
import { validateQuery, validateBody, validateParams } from '../middlewares/validate.middleware.js';
import { getRoomsQuerySchema, getRoomByIdParamsSchema } from '../validators/room.validator.js';
import { createRoomSchema, updateRoomSchema } from '../validators/admin-room.validator.js';
import {
  getAdminBookingsQuerySchema,
  createGuestBookingSchema,
  confirmPaymentParamsSchema,
  confirmPaymentBodySchema,
  adminCancelBookingParamsSchema,
  adminCancelBookingBodySchema,
} from '../validators/admin-booking.validator.js';
import { uploadRoomImagesMiddleware } from '../middlewares/room-image-upload.middleware.js';

const router = Router();

router.get('/rooms', validateQuery(getRoomsQuerySchema), adminRoomController.getRooms);
router.post('/rooms', validateBody(createRoomSchema), adminRoomController.createRoom);
router.patch(
  '/rooms/:id',
  validateParams(getRoomByIdParamsSchema),
  validateBody(updateRoomSchema),
  adminRoomController.updateRoom,
);
router.post(
  '/rooms/:id/images',
  validateParams(getRoomByIdParamsSchema),
  uploadRoomImagesMiddleware,
  adminRoomImageController.uploadImages,
);

router.get(
  '/bookings',
  validateQuery(getAdminBookingsQuerySchema),
  adminBookingController.getBookings,
);
router.post(
  '/bookings/guest',
  validateBody(createGuestBookingSchema),
  adminBookingController.createGuestBooking,
);
router.patch(
  '/bookings/:id/payment',
  validateParams(confirmPaymentParamsSchema),
  validateBody(confirmPaymentBodySchema),
  adminBookingController.confirmPayment,
);
router.patch(
  '/bookings/:id/cancel',
  validateParams(adminCancelBookingParamsSchema),
  validateBody(adminCancelBookingBodySchema),
  adminBookingController.cancelBooking,
);

export default router;
