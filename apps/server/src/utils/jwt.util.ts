import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { ENV } from '../config/env.config.js';

export interface JwtCustomPayload {
  sub: string;
  role: Role;
  /** Token version (CWB-77); absent on tokens issued before revocation existed, read as 0. */
  tv?: number;
  iat?: number;
  exp?: number;
}

export const generateToken = (
  payload: { sub: string; role: Role; tv?: number },
  options?: jwt.SignOptions,
): string => {
  return jwt.sign({ sub: payload.sub, role: payload.role, tv: payload.tv ?? 0 }, ENV.JWT_SECRET, {
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
