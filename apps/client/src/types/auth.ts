export type Role = 'CUSTOMER' | 'ADMIN';

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: Role;
}

export interface AuthPrincipal {
  id: string;
  role: Role;
  email?: string;
  fullName?: string;
}

export interface JwtPayload {
  sub: string;
  role: Role;
  exp: number;
  iat?: number;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginData {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: SafeUser;
}
