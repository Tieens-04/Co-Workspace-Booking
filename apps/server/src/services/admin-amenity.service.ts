import { Prisma } from '@prisma/client';
import { AppError } from '../utils/error.util.js';
import {
  AdminAmenityRecord,
  AdminAmenityRepository,
  adminAmenityRepository,
} from '../repositories/amenity.repository.js';
import { AmenityDto } from '../types/amenity.type.js';
import type { CreateAmenityInput, UpdateAmenityInput } from '../validators/amenity.validator.js';

const isPrismaError = (err: unknown, code: string) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

const nameTaken = () => new AppError('AMENITY_NAME_EXISTS', 'Tên tiện ích đã tồn tại', 409);
const notFound = () => new AppError('AMENITY_NOT_FOUND', 'Không tìm thấy tiện ích', 404);

/** ADMIN-only amenity catalog management (CWB-65). */
export class AdminAmenityService {
  constructor(private readonly repo: AdminAmenityRepository = adminAmenityRepository) {}

  list(): Promise<AdminAmenityRecord[]> {
    return this.repo.findAllWithUsage();
  }

  async create(input: CreateAmenityInput): Promise<AmenityDto> {
    try {
      return await this.repo.create({
        name: input.name,
        icon: input.icon ?? null,
        description: input.description ?? null,
      });
    } catch (err) {
      if (isPrismaError(err, 'P2002')) throw nameTaken();
      throw err;
    }
  }

  async update(id: string, input: UpdateAmenityInput): Promise<AmenityDto> {
    try {
      return await this.repo.update(id, input);
    } catch (err) {
      if (isPrismaError(err, 'P2002')) throw nameTaken();
      if (isPrismaError(err, 'P2025')) throw notFound();
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.deleteIfUnused(id);
    if (!result.found) throw notFound();
    if (!result.deleted) {
      throw new AppError(
        'AMENITY_IN_USE',
        `Tiện ích đang được gán cho ${result.roomCount} phòng. Hãy gỡ khỏi các phòng trước khi xóa.`,
        409,
        { roomCount: result.roomCount },
      );
    }
  }
}

export const adminAmenityService = new AdminAmenityService();
