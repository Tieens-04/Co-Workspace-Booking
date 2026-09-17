import { Router } from 'express';
import { roomController } from '../controllers/room.controller.js';
import { validateQuery, validateParams } from '../middlewares/validate.middleware.js';
import { getRoomsQuerySchema, getRoomByIdParamsSchema } from '../validators/room.validator.js';

const roomRouter = Router();

roomRouter.get('/', validateQuery(getRoomsQuerySchema), roomController.getRooms);
roomRouter.get('/:id', validateParams(getRoomByIdParamsSchema), roomController.getRoomById);

export default roomRouter;
