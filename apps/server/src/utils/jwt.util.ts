import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { ENV } from '../config/env.config.js';

export interface JwtCustomPayload {
  sub: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export const generateToken = (
  payload: { sub: string; role: Role },
  options?: jwt.SignOptions,
): string => {
  return jwt.sign(payload, ENV.JWT_SECRET, {
    ...options,
    algorithm: 'HS256',
    expiresIn: options?.expiresIn ?? ENV.JWT_EXPIRES_IN_SECONDS,
  });
};

export const verifyToken = <T extends object = JwtCustomPayload>(token: string): T => {
  return jwt.verify(token, ENV.JWT_SECRET, {
    algorithms: ['HS256'],
  }) as T;
};
