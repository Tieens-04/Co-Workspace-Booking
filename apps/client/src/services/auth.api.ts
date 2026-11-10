import { apiClient } from './api';
import {
  ApiSuccessResponse,
  LoginData,
  LoginRequest,
  RegisterRequest,
  SafeUser,
} from '../types/auth';

export const authApi = {
  async register(payload: RegisterRequest): Promise<ApiSuccessResponse<SafeUser>> {
    const response = await apiClient.post<ApiSuccessResponse<SafeUser>>('/auth/register', payload);
    return response.data;
  },

  /** Always resolves with the same message whether or not the email is registered. */
  async forgotPassword(email: string): Promise<ApiSuccessResponse<null>> {
    const response = await apiClient.post<ApiSuccessResponse<null>>('/auth/forgot-password', {
      email,
    });
    return response.data;
  },

  async resetPassword(token: string, newPassword: string): Promise<ApiSuccessResponse<null>> {
    const response = await apiClient.post<ApiSuccessResponse<null>>('/auth/reset-password', {
      token,
      newPassword,
    });
    return response.data;
  },

  async verifyEmail(token: string): Promise<ApiSuccessResponse<null>> {
    const response = await apiClient.post<ApiSuccessResponse<null>>('/auth/verify-email', {
      token,
    });
    return response.data;
  },

  async resendVerification(): Promise<ApiSuccessResponse<null>> {
    const response = await apiClient.post<ApiSuccessResponse<null>>('/auth/resend-verification', {});
    return response.data;
  },

  async login(payload: LoginRequest): Promise<ApiSuccessResponse<LoginData>> {
    const response = await apiClient.post<ApiSuccessResponse<LoginData>>('/auth/login', payload);
    return response.data;
  },
};
