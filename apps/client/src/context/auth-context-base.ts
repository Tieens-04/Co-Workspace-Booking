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
  /** Refreshes name/email shown in the UI after a profile load or update. */
  applyProfile: (user: SafeUser) => void;
  /** Reloads /me profile to sync verification state or profile updates. */
  refreshProfile: () => Promise<void>;
  logout: (reason?: 'sessionExpired' | 'userAction') => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
