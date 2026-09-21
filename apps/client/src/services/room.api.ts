import { apiClient } from './api';
import {
  ApiResponse,
  GetRoomsParams,
  GetRoomsResponseData,
  RoomDetail,
  Amenity,
  RoomAvailabilityResponseData,
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

  getAvailability: async (
    id: string,
    date: string,
    signal?: AbortSignal,
  ): Promise<ApiResponse<RoomAvailabilityResponseData>> => {
    const response = await apiClient.get<ApiResponse<RoomAvailabilityResponseData>>(
      `/rooms/${id}/availability`,
      {
        params: { date },
        signal,
      },
    );
    return response.data;
  },
};
