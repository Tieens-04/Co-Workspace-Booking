import { apiClient } from './api';
import { ApiResponse, GetRoomsParams, GetRoomsResponseData, RoomDetail } from '../types/room';
import { CreateRoomPayload, UpdateRoomPayload } from '../types/admin-room';

export const adminRoomApi = {
  getAdminRooms: async (
    params?: GetRoomsParams,
    signal?: AbortSignal,
  ): Promise<ApiResponse<GetRoomsResponseData>> => {
    const response = await apiClient.get<ApiResponse<GetRoomsResponseData>>('/admin/rooms', {
      params,
      signal,
    });
    return response.data;
  },

  createRoom: async (payload: CreateRoomPayload): Promise<ApiResponse<RoomDetail>> => {
    const response = await apiClient.post<ApiResponse<RoomDetail>>('/admin/rooms', payload);
    return response.data;
  },

  updateRoom: async (id: string, payload: UpdateRoomPayload): Promise<ApiResponse<RoomDetail>> => {
    const response = await apiClient.patch<ApiResponse<RoomDetail>>(`/admin/rooms/${id}`, payload);
    return response.data;
  },
};
