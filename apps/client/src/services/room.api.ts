import { apiClient } from './api';
import {
  ApiResponse,
  GetRoomsParams,
  GetRoomsResponseData,
  RoomDetail,
  Amenity,
} from '../types/room';

export const roomApi = {
  getRooms: async (
    params?: GetRoomsParams,
    signal?: AbortSignal,
  ): Promise<ApiResponse<GetRoomsResponseData>> => {
    const response = await apiClient.get<ApiResponse<GetRoomsResponseData>>('/rooms', {
      params,
      signal,
    });
    return response.data;
  },

  getRoomById: async (id: string, signal?: AbortSignal): Promise<ApiResponse<RoomDetail>> => {
    const response = await apiClient.get<ApiResponse<RoomDetail>>(`/rooms/${id}`, {
      signal,
    });
    return response.data;
  },

  getAmenities: async (signal?: AbortSignal): Promise<ApiResponse<Amenity[]>> => {
    const response = await apiClient.get<ApiResponse<Amenity[]>>('/amenities', {
      signal,
    });
    return response.data;
  },
};
