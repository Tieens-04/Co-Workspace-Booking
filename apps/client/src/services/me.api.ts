import { apiClient } from './api';
import {
  ApiSuccessResponse,
  ChangePasswordRequest,
  LoginData,
  SafeUser,
  UpdateProfileRequest,
} from '../types/auth';

/** Self-service account endpoints; the server always acts on the account in the JWT. */
export const meApi = {
  async getMe(signal?: AbortSignal): Promise<ApiSuccessResponse<SafeUser>> {
    const response = await apiClient.get<ApiSuccessResponse<SafeUser>>('/me', { signal });
    return response.data;
  },

  async updateMe(payload: UpdateProfileRequest): Promise<ApiSuccessResponse<SafeUser>> {
    const response = await apiClient.patch<ApiSuccessResponse<SafeUser>>('/me', payload);
    return response.data;
  },

  async changePassword(payload: ChangePasswordRequest): Promise<ApiSuccessResponse<LoginData>> {
    const response = await apiClient.post<ApiSuccessResponse<LoginData>>('/me/password', payload);
    return response.data;
  },
};
