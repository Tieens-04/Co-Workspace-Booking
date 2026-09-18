import { Request, Response, NextFunction } from 'express';
import { amenityService, AmenityService } from '../services/amenity.service.js';
import { sendSuccess } from '../utils/response.util.js';

export class AmenityController {
  constructor(private readonly service: AmenityService = amenityService) {}

  getAmenities = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getAmenities();
      return sendSuccess(res, result, 'Lấy danh sách tiện ích thành công', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const amenityController = new AmenityController();
