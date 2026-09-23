import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from '../services/api';
import { AuthPrincipal, SafeUser } from '../types/auth';
import {
  decodeJwt,
  getStoredToken,
  getValidPrincipalFromToken,
  removeStoredToken,
  setStoredToken,
  TOKEN_STORAGE_KEY,
} from '../utils/token';
import { sanitizeHistoryState } from '../utils/history';
import { AuthContext, AuthContextType } from './auth-context-base';

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(() => {
    const initialToken = getStoredToken();
    return getValidPrincipalFromToken(initialToken);
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const logout = useCallback(
    (reason: 'sessionExpired' | 'userAction' = 'userAction') => {
      sanitizeHistoryState();
      removeStoredToken();
      setToken(null);
      setPrincipal(null);
      setSessionExpired(reason === 'sessionExpired');
      navigate('/login', {
        replace: true,
        state: reason === 'sessionExpired' ? { sessionExpired: true } : undefined,
      });
    },
    [navigate],
  );

  const login = useCallback((accessToken: string, user: SafeUser) => {
    if (!setStoredToken(accessToken)) {
      removeStoredToken();
      setToken(null);
      setPrincipal(null);
      return false;
    }

    setToken(accessToken);
    setPrincipal({
      id: user.id,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
    });
    setSessionExpired(false);
    return true;
  }, []);

  // Validate initial token state
  useEffect(() => {
    const currentStored = getStoredToken();
    if (currentStored) {
      const validPrincipal = getValidPrincipalFromToken(currentStored);
      if (validPrincipal) {
        setToken(currentStored);
        setPrincipal(validPrincipal);
      } else {
        removeStoredToken();
        setToken(null);
        setPrincipal(null);
      }
    } else {
      setToken(null);
      setPrincipal(null);
    }
    setIsLoading(false);
  }, []);

  // Connect unauthorized handler from Axios interceptor
  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      logout(reason);
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  // Handle cross-tab synchronization
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_STORAGE_KEY) {
        // Ignore an older queued event if storage already contains a newer session value.
        if (getStoredToken() !== event.newValue) return;

        if (!event.newValue) {
          // Token removed in another tab
          if (token) {
            logout('userAction');
          }
        } else {
          // Token updated in another tab
          const validPrincipal = getValidPrincipalFromToken(event.newValue);
          if (validPrincipal) {
            setToken(event.newValue);
            setPrincipal(validPrincipal);
            setSessionExpired(false);
          } else if (token) {
            logout('sessionExpired');
          } else {
            removeStoredToken();
            setToken(null);
            setPrincipal(null);
          }
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [logout, token]);

  // Auto-logout timer when token expires
  useEffect(() => {
    if (!token) return;

    let timerId: number | undefined;
    let cancelled = false;

    const scheduleExpiryCheck = () => {
      if (cancelled) return;

      // A queued timer from an older session must not clear a newer session.
      if (getStoredToken() !== token) return;

      const payload = decodeJwt(token);
      if (!payload) {
        logout('sessionExpired');
        return;
      }

      const remainingMs = payload.exp * 1000 - Date.now();
      if (remainingMs <= 0) {
        logout('sessionExpired');
        return;
      }

      timerId = window.setTimeout(scheduleExpiryCheck, Math.min(remainingMs, MAX_TIMER_DELAY_MS));
    };

    scheduleExpiryCheck();

    return () => {
      cancelled = true;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, [token, logout]);

  const value = useMemo<AuthContextType>(
    () => ({
      token,
      principal,
      isAuthenticated: Boolean(token && principal),
      isLoading,
      sessionExpired,
      clearSessionExpiredNotice,
      login,
      logout,
    }),
    [token, principal, isLoading, sessionExpired, clearSessionExpiredNotice, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
