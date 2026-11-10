export type Role = 'CUSTOMER' | 'ADMIN';

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: Role;
  emailVerifiedAt: string | null;
}

export interface AuthPrincipal {
  id: string;
  role: Role;
  email?: string;
  fullName?: string;
  emailVerifiedAt?: string | null;
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

export interface UpdateProfileRequest {
  fullName?: string;
  phoneNumber?: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** `POST /me/deletion` (CWB-88): the current password re-confirms the account owner. */
export interface DeleteAccountRequest {
  currentPassword: string;
}

/** Booking listed in the 409 ACCOUNT_HAS_ACTIVE_BOOKINGS details; it must be cancelled first. */
export interface DeletionBlockingBooking {
  id: string;
  bookingCode: string;
  roomName: string;
  startTime: string;
  endTime: string;
}

export interface VerifyEmailRequest {
  token: string;
}
