import { Role } from '@prisma/client';

export interface RequestUser {
  sub: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}
