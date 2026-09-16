import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { sendError } from '../utils/response.util.js';
import { AppError } from '../utils/error.util.js';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return sendError(res, err.code, err.message, err.statusCode, err.details);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return sendError(res, 'RESOURCE_CONFLICT', 'Dữ liệu đã tồn tại', 409);
  }

  // Handle JSON parse error from express.json()
  if ('type' in err && err.type === 'entity.parse.failed') {
    return sendError(res, 'VALIDATION_ERROR', 'Dữ liệu JSON không hợp lệ', 400);
  }

  // Unexpected errors
  console.error('Unhandled Error:', err);
  return sendError(res, 'INTERNAL_SERVER_ERROR', 'Đã có lỗi xảy ra trên hệ thống', 500);
};
