import { Request, Response, NextFunction } from 'express';
import { adminAmenityService, AdminAmenityService } from '../services/admin-amenity.service.js';
import { sendSuccess } from '../utils/response.util.js';

export class AdminAmenityController {
  constructor(private readonly service: AdminAmenityService = adminAmenityService) {}

  list = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      return sendSuccess(res, await this.service.list(), 'Lấy danh sách tiện ích thành công');
    } catch (err) {
      return next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      return sendSuccess(res, await this.service.create(req.body), 'Tạo tiện ích thành công', 201);
    } catch (err) {
      return next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const amenity = await this.service.update(req.params.id, req.body);
      return sendSuccess(res, amenity, 'Cập nhật tiện ích thành công');
    } catch (err) {
      return next(err);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.remove(req.params.id);
      return sendSuccess(res, null, 'Xóa tiện ích thành công');
    } catch (err) {
      return next(err);
    }
  };
}

export const adminAmenityController = new AdminAmenityController();
