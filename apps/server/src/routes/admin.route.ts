import { Router } from 'express';
import { adminRoomController } from '../controllers/admin-room.controller.js';
import { adminRoomImageController } from '../controllers/admin-room-image.controller.js';
import { adminBookingController } from '../controllers/admin-booking.controller.js';
import { adminDashboardController } from '../controllers/admin-dashboard.controller.js';
import { adminAmenityController } from '../controllers/admin-amenity.controller.js';
import {
  amenityIdParamsSchema,
  createAmenitySchema,
  getAmenitiesQuerySchema,
  updateAmenitySchema,
} from '../validators/amenity.validator.js';
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
  completeBookingBodySchema,
  checkInBookingParamsSchema,
  checkInBookingBodySchema,
  markNoShowParamsSchema,
  markNoShowBodySchema,
  adminBookingMutationQuerySchema,
  getRevenueQuerySchema,
  exportReportQuerySchema,
} from '../validators/admin-booking.validator.js';
import { adminReportController } from '../controllers/admin-report.controller.js';
import {
  getDashboardKpiQuerySchema,
  getDashboardScheduleQuerySchema,
} from '../validators/admin-dashboard.validator.js';
import { adminAuditController } from '../controllers/admin-audit.controller.js';
import { getAuditEventsQuerySchema } from '../validators/admin-audit.validator.js';
import { adminEmailOutboxController } from '../controllers/admin-email-outbox.controller.js';
import {
  emailOutboxIdParamsSchema,
  getEmailOutboxQuerySchema,
} from '../validators/admin-email-outbox.validator.js';
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
  validateQuery(adminBookingMutationQuerySchema),
  validateBody(confirmPaymentBodySchema),
  adminBookingController.confirmPayment,
);
router.patch(
  '/bookings/:id/cancel',
  validateParams(adminCancelBookingParamsSchema),
  validateQuery(adminBookingMutationQuerySchema),
  validateBody(adminCancelBookingBodySchema),
  adminBookingController.cancelBooking,
);
router.patch(
  '/bookings/:id/check-in',
  validateParams(checkInBookingParamsSchema),
  validateQuery(adminBookingMutationQuerySchema),
  validateBody(checkInBookingBodySchema),
  adminBookingController.checkInBooking,
);
router.patch(
  '/bookings/:id/complete',
  validateParams(completeBookingParamsSchema),
  validateQuery(adminBookingMutationQuerySchema),
  validateBody(completeBookingBodySchema),
  adminBookingController.completeBooking,
);
router.patch(
  '/bookings/:id/no-show',
  validateParams(markNoShowParamsSchema),
  validateQuery(adminBookingMutationQuerySchema),
  validateBody(markNoShowBodySchema),
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

router.get('/amenities', validateQuery(getAmenitiesQuerySchema), adminAmenityController.list);
router.post('/amenities', validateBody(createAmenitySchema), adminAmenityController.create);
router.patch(
  '/amenities/:id',
  validateParams(amenityIdParamsSchema),
  validateBody(updateAmenitySchema),
  adminAmenityController.update,
);
router.delete(
  '/amenities/:id',
  validateParams(amenityIdParamsSchema),
  adminAmenityController.remove,
);

router.get(
  '/reports/bookings.csv',
  validateQuery(exportReportQuerySchema),
  adminReportController.bookings,
);
router.get(
  '/reports/revenue.csv',
  validateQuery(exportReportQuerySchema),
  adminReportController.revenue,
);

router.get('/audit-events', validateQuery(getAuditEventsQuerySchema), adminAuditController.list);

router.get(
  '/email-outbox',
  validateQuery(getEmailOutboxQuerySchema),
  adminEmailOutboxController.list,
);
router.post(
  '/email-outbox/:id/retry',
  validateParams(emailOutboxIdParamsSchema),
  adminEmailOutboxController.retry,
);

export default router;
