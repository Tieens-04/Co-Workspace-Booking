import { Router } from 'express';
import { amenityController } from '../controllers/amenity.controller.js';
import { validateQuery } from '../middlewares/validate.middleware.js';
import { getAmenitiesQuerySchema } from '../validators/amenity.validator.js';

const amenityRouter = Router();

amenityRouter.get('/', validateQuery(getAmenitiesQuerySchema), amenityController.getAmenities);

export default amenityRouter;
