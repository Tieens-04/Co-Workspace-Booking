import { createContext } from 'react';
import { AuthPrincipal, SafeUser } from '../types/auth';

export interface AuthContextType {
  token: string | null;
  principal: AuthPrincipal | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionExpired: boolean;
  clearSessionExpiredNotice: () => void;
  login: (accessToken: string, user: SafeUser) => boolean;
  logout: (reason?: 'sessionExpired' | 'userAction') => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
