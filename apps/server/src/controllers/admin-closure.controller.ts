import { Request, Response, NextFunction } from 'express';
import { adminClosureService, AdminClosureService } from '../services/admin-closure.service.js';
import { auditActorOf } from '../utils/audit-actor.util.js';
import { sendSuccess } from '../utils/response.util.js';
import { AppError } from '../utils/error.util.js';
import { ClosureFilterParams, CreateClosureInput, UpdateClosureInput } from '../types/closure.type.js';

export class AdminClosureController {
  constructor(private readonly service: AdminClosureService = adminClosureService) {}

  listClosures = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as {
        page?: number;
        limit?: number;
        roomId?: string;
        from?: string;
        to?: string;
        upcoming?: boolean;
      };

      const filter: ClosureFilterParams = {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        roomId: query.roomId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        upcoming: query.upcoming,
      };

      const result = await this.service.listClosures(filter);
      return sendSuccess(res, result, 'Lấy danh sách khung đóng cửa thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  getClosureById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.service.getClosureById(id);
      return sendSuccess(res, result, 'Lấy thông tin khung đóng cửa thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  createClosure = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = auditActorOf(req);
      if (!actor) {
        throw new AppError('UNAUTHORIZED', 'Chưa xác thực', 401);
      }
      const body = req.body as CreateClosureInput;
      const result = await this.service.createClosure(body, actor);
      return sendSuccess(res, result, 'Tạo khung đóng cửa thành công', 201);
    } catch (err) {
      return next(err);
    }
  };

  updateClosure = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = auditActorOf(req);
      if (!actor) {
        throw new AppError('UNAUTHORIZED', 'Chưa xác thực', 401);
      }
      const { id } = req.params;
      const body = req.body as UpdateClosureInput;
      const result = await this.service.updateClosure(id, body, actor);
      return sendSuccess(res, result, 'Cập nhật khung đóng cửa thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  deleteClosure = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = auditActorOf(req);
      if (!actor) {
        throw new AppError('UNAUTHORIZED', 'Chưa xác thực', 401);
      }
      const { id } = req.params;
      const result = await this.service.deleteClosure(id, actor);
      return sendSuccess(res, result, 'Xóa khung đóng cửa thành công', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const adminClosureController = new AdminClosureController();
