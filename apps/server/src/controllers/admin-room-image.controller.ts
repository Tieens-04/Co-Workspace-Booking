import { Request, Response, NextFunction } from 'express';
import { roomImageService, RoomImageServiceContract } from '../services/room-image.service.js';
import { sendSuccess } from '../utils/response.util.js';

export class AdminRoomImageController {
  constructor(private readonly imageService: RoomImageServiceContract = roomImageService) {}

  uploadImages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const files = (req.files as Express.Multer.File[]) || [];
      const result = await this.imageService.uploadRoomImages(id, files);
      return sendSuccess(res, result, 'Tải ảnh phòng lên thành công', 201);
    } catch (err) {
      return next(err);
    }
  };
}

export const adminRoomImageController = new AdminRoomImageController();
