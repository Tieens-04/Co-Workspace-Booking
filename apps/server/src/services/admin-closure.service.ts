import { closureRepository, ClosureRepository } from '../repositories/closure.repository.js';
import { AuditActor } from '../repositories/audit.repository.js';
import { AppError } from '../utils/error.util.js';
import {
  ClosureDto,
  ClosureFilterParams,
  CreateClosureInput,
  UpdateClosureInput,
} from '../types/closure.type.js';

export class AdminClosureService {
  constructor(private readonly repo: ClosureRepository = closureRepository) {}

  async listClosures(filter: ClosureFilterParams) {
    return this.repo.findPaginated(filter);
  }

  async getClosureById(id: string): Promise<ClosureDto> {
    const item = await this.repo.findById(id);
    if (!item) {
      throw new AppError('CLOSURE_NOT_FOUND', 'Không tìm thấy khung đóng cửa', 404);
    }
    return item;
  }

  async createClosure(data: CreateClosureInput, actor: AuditActor): Promise<ClosureDto> {
    return this.repo.create(data, actor);
  }

  async updateClosure(
    id: string,
    data: UpdateClosureInput,
    actor: AuditActor,
  ): Promise<ClosureDto> {
    return this.repo.update(id, data, actor);
  }

  async deleteClosure(id: string, actor: AuditActor): Promise<ClosureDto> {
    return this.repo.delete(id, actor);
  }
}

export const adminClosureService = new AdminClosureService();
