import { Request, Response, NextFunction } from 'express';
import { adminRoomService, AdminRoomService } from '../services/admin-room.service.js';
import { roomService, RoomService } from '../services/room.service.js';
import { sendSuccess } from '../utils/response.util.js';
import { FindRoomsFilter } from '../types/room.type.js';
import { CreateRoomInput, UpdateRoomInput } from '../validators/admin-room.validator.js';

export class AdminRoomController {
  constructor(
    private readonly adminService: AdminRoomService = adminRoomService,
    private readonly publicService: RoomService = roomService,
  ) {}

  getRooms = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = req.query as unknown as FindRoomsFilter;
      const result = await this.publicService.getRooms(filter);
      return sendSuccess(res, result, 'Lấy danh sách phòng thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  createRoom = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateRoomInput;
      const result = await this.adminService.createRoom(body);
      return sendSuccess(res, result, 'Tạo phòng thành công', 201);
    } catch (err) {
      return next(err);
    }
  };

  updateRoom = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateRoomInput;
      const result = await this.adminService.updateRoom(id, body);
      return sendSuccess(res, result, 'Cập nhật thông tin phòng thành công', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const adminRoomController = new AdminRoomController();
