import { apiClient } from './api';
import { ApiResponse } from '../types/room';
import {
  ClosureItem,
  ClosureFilterQuery,
  CreateClosurePayload,
  UpdateClosurePayload,
} from '../types/closure';

export interface PaginatedClosuresData {
  items: ClosureItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const adminClosureApi = {
  list: async (
    params?: ClosureFilterQuery,
    signal?: AbortSignal,
  ): Promise<ApiResponse<PaginatedClosuresData>> => {
    const response = await apiClient.get<ApiResponse<PaginatedClosuresData>>('/admin/closures', {
      params,
      signal,
    });
    return response.data;
  },

  create: async (payload: CreateClosurePayload): Promise<ApiResponse<ClosureItem>> => {
    const response = await apiClient.post<ApiResponse<ClosureItem>>('/admin/closures', payload);
    return response.data;
  },

  update: async (
    id: string,
    payload: UpdateClosurePayload,
  ): Promise<ApiResponse<ClosureItem>> => {
    const response = await apiClient.patch<ApiResponse<ClosureItem>>(
      `/admin/closures/${id}`,
      payload,
    );
    return response.data;
  },

  delete: async (id: string): Promise<ApiResponse<ClosureItem>> => {
    const response = await apiClient.delete<ApiResponse<ClosureItem>>(`/admin/closures/${id}`);
    return response.data;
  },
};
