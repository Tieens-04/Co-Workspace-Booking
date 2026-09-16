import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { verifyToken as verifyJwtToken, JwtCustomPayload } from '../utils/jwt.util.js';
import { AppError } from '../utils/error.util.js';
import '../types/auth.type.js';

export const verifyToken = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      return next(new AppError('UNAUTHORIZED', 'Vui lòng đăng nhập để tiếp tục', 401));
    }

    if (!/^Bearer /i.test(authHeader)) {
      return next(new AppError('UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn', 401));
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return next(new AppError('UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn', 401));
    }

    let payload: JwtCustomPayload;
    try {
      payload = verifyJwtToken<JwtCustomPayload>(token);
    } catch (error) {
      if (
        error instanceof jwt.JsonWebTokenError ||
        // JWT decoding can throw SyntaxError for malformed payload JSON.
        error instanceof SyntaxError ||
        (error instanceof Error &&
          ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name))
      ) {
        return next(new AppError('UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn', 401));
      }
      return next(error);
    }

    const isValidSub = typeof payload.sub === 'string' && payload.sub.trim().length > 0;
    const isValidRole =
      typeof payload.role === 'string' && Object.values(Role).includes(payload.role as Role);
    const isValidExp = typeof payload.exp === 'number' && Number.isFinite(payload.exp);

    if (!isValidSub || !isValidRole || !isValidExp) {
      return next(new AppError('UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn', 401));
    }

    // Only assign verified identity and role from token payload, ignoring body/query
    req.user = {
      sub: payload.sub,
      role: payload.role as Role,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

export const checkRole = (allowedRoles: readonly Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('UNAUTHORIZED', 'Vui lòng đăng nhập để tiếp tục', 401));
    }

    if (allowedRoles.length === 0 || !allowedRoles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này', 403));
    }

    return next();
  };
};
