import { Response } from 'express';

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

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
  });
};

export const sendError = (
  res: Response,
  code: string,
  message = 'Đã có lỗi xảy ra',
  statusCode = 500,
  details?: unknown,
) => {
  const responseBody: ApiErrorResponse = {
    success: false,
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  };
  return res.status(statusCode).json(responseBody);
};
