import {
  AmenityRepositoryContract,
  amenityRepository,
} from '../repositories/amenity.repository.js';
import { AmenityDto } from '../types/amenity.type.js';

export class AmenityService {
  constructor(private readonly amenityRepo: AmenityRepositoryContract = amenityRepository) {}

  async getAmenities(): Promise<AmenityDto[]> {
    const amenities = await this.amenityRepo.findAll();
    return amenities.map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      description: a.description,
    }));
  }
}

export const amenityService = new AmenityService();
