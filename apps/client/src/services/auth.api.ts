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

  async login(payload: LoginRequest): Promise<ApiSuccessResponse<LoginData>> {
    const response = await apiClient.post<ApiSuccessResponse<LoginData>>('/auth/login', payload);
    return response.data;
  },
};
