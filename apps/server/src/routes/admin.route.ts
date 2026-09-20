import { Router } from 'express';
import { adminRoomController } from '../controllers/admin-room.controller.js';
import { adminRoomImageController } from '../controllers/admin-room-image.controller.js';
import { validateQuery, validateBody, validateParams } from '../middlewares/validate.middleware.js';
import { getRoomsQuerySchema, getRoomByIdParamsSchema } from '../validators/room.validator.js';
import { createRoomSchema, updateRoomSchema } from '../validators/admin-room.validator.js';
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

export default router;
