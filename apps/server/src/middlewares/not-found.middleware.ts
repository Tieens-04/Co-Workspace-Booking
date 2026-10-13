import { Request, Response } from 'express';
import { sendError } from '../utils/response.util.js';

export const notFoundHandler = (_req: Request, res: Response) => {
  return sendError(res, 'NOT_FOUND', 'Route không tồn tại', 404);
};
