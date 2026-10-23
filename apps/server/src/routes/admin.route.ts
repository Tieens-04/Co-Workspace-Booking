import { Router } from 'express';
import { adminRoomController } from '../controllers/admin-room.controller.js';
import { adminRoomImageController } from '../controllers/admin-room-image.controller.js';
import { adminBookingController } from '../controllers/admin-booking.controller.js';
import { adminDashboardController } from '../controllers/admin-dashboard.controller.js';
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
  completeBookingParamsSchema,
  checkInBookingParamsSchema,
  checkInBookingBodySchema,
  markNoShowParamsSchema,
  getRevenueQuerySchema,
} from '../validators/admin-booking.validator.js';
import {
  getDashboardKpiQuerySchema,
  getDashboardScheduleQuerySchema,
} from '../validators/admin-dashboard.validator.js';
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
router.patch(
  '/bookings/:id/check-in',
  validateParams(checkInBookingParamsSchema),
  validateBody(checkInBookingBodySchema),
  adminBookingController.checkInBooking,
);
router.patch(
  '/bookings/:id/complete',
  validateParams(completeBookingParamsSchema),
  adminBookingController.completeBooking,
);
router.patch(
  '/bookings/:id/no-show',
  validateParams(markNoShowParamsSchema),
  adminBookingController.markNoShow,
);
router.get('/revenue', validateQuery(getRevenueQuerySchema), adminBookingController.getRevenue);
router.get(
  '/bookings/revenue',
  validateQuery(getRevenueQuerySchema),
  adminBookingController.getRevenue,
);

router.get(
  '/dashboard/kpi',
  validateQuery(getDashboardKpiQuerySchema),
  adminDashboardController.getKpi,
);
router.get(
  '/dashboard/schedule',
  validateQuery(getDashboardScheduleQuerySchema),
  adminDashboardController.getSchedule,
);

export default router;
