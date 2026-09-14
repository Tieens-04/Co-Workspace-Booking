import { Response } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: unknown;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message = 'Thành công',
  statusCode = 200,
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  } satisfies ApiResponse<T>);
};

export const sendError = (
  res: Response,
  message = 'Đã có lỗi xảy ra',
  statusCode = 500,
  error?: unknown,
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error,
  } satisfies ApiResponse<null>);
};
