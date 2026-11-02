import { apiClient } from './api';
import { Amenity, ApiResponse } from '../types/room';

export interface AdminAmenity extends Amenity {
  /** Number of rooms currently linked to this amenity. */
  roomCount: number;
}

export interface AmenityPayload {
  name?: string;
  icon?: string | null;
  description?: string | null;
}

export const adminAmenityApi = {
  list: async (signal?: AbortSignal): Promise<ApiResponse<AdminAmenity[]>> => {
    const response = await apiClient.get<ApiResponse<AdminAmenity[]>>('/admin/amenities', {
      signal,
    });
    return response.data;
  },

  create: async (payload: AmenityPayload): Promise<ApiResponse<Amenity>> => {
    const response = await apiClient.post<ApiResponse<Amenity>>('/admin/amenities', payload);
    return response.data;
  },

  update: async (id: string, payload: AmenityPayload): Promise<ApiResponse<Amenity>> => {
    const response = await apiClient.patch<ApiResponse<Amenity>>(`/admin/amenities/${id}`, payload);
    return response.data;
  },

  remove: async (id: string): Promise<ApiResponse<null>> => {
    const response = await apiClient.delete<ApiResponse<null>>(`/admin/amenities/${id}`);
    return response.data;
  },
};
