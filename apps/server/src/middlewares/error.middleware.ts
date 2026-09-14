import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.util.js';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Error:', err);
  return sendError(res, err.message || 'Internal Server Error', 500);
};
