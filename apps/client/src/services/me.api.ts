import { apiClient } from './api';
import {
  ApiSuccessResponse,
  ChangePasswordRequest,
  DeleteAccountRequest,
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

  /** Revokes every token of this account, the current one included (CWB-77). */
  async logoutAll(): Promise<ApiSuccessResponse<null>> {
    const response = await apiClient.post<ApiSuccessResponse<null>>('/me/logout-all');
    return response.data;
  },

  /** Anonymizes this customer account and ends every session (CWB-88). */
  async deleteAccount(payload: DeleteAccountRequest): Promise<ApiSuccessResponse<null>> {
    const response = await apiClient.post<ApiSuccessResponse<null>>('/me/deletion', payload);
    return response.data;
  },
};
