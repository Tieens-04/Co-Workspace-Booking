import { AdminUserRepository, adminUserRepository } from '../repositories/admin-user.repository.js';
import type { AuditActor } from '../repositories/audit.repository.js';
import {
  AccountStatus,
  AdminUserListResponseData,
  FindAdminUsersFilter,
  UpdateUserStatusResult,
} from '../types/admin-user.type.js';
import { AppError } from '../utils/error.util.js';

/** CWB-79: admin customer management (list/search, lock/unlock). */
export class AdminUserService {
  constructor(private readonly repo: AdminUserRepository = adminUserRepository) {}

  async list(filter: FindAdminUsersFilter, now = new Date()): Promise<AdminUserListResponseData> {
    const [total, items] = await this.repo.findManyAndCount(filter, now);
    return {
      items,
      pagination: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / filter.limit),
      },
    };
  }

  async updateStatus(
    userId: string,
    status: AccountStatus,
    reason: string,
    actor: AuditActor | undefined,
    now = new Date(),
  ): Promise<UpdateUserStatusResult> {
    // Routes are ADMIN-only behind verifyToken; a missing actor is a wiring bug, not a client error.
    if (!actor) throw new AppError('UNAUTHORIZED', 'Vui lòng đăng nhập để tiếp tục', 401);
    return this.repo.updateStatus({ userId, status, reason, actor, now });
  }
}

export const adminUserService = new AdminUserService();
