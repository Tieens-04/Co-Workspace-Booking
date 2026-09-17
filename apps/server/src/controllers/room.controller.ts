import { Request, Response, NextFunction } from 'express';
import { roomService, RoomService } from '../services/room.service.js';
import { sendSuccess } from '../utils/response.util.js';
import { FindRoomsFilter } from '../types/room.type.js';

export class RoomController {
  constructor(private readonly service: RoomService = roomService) {}

  getRooms = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = req.query as unknown as FindRoomsFilter;
      const result = await this.service.getRooms(filter);
      return sendSuccess(res, result, 'Lấy danh sách phòng thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  getRoomById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.service.getRoomById(id);
      return sendSuccess(res, result, 'Lấy thông tin chi tiết phòng thành công', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const roomController = new RoomController();
