import React, { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { ToastCard } from '../components/ToastCard';
import { ToastContext, ToastType } from './toast-context-base';

export type { ToastType, ToastContextValue } from './toast-context-base';

const DEFAULT_DURATION = 4000;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const removeToast = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = DEFAULT_DURATION) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      toast.custom(
        (toastId) => (
          <ToastCard type={type} message={message} onDismiss={() => toast.dismiss(toastId)} />
        ),
        { id, duration: duration > 0 ? duration : Infinity },
      );
    },
    [],
  );

  const value = useMemo(() => ({ showToast, removeToast }), [showToast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster position="top-right" containerAriaLabel="Thông báo hệ thống" gap={10} />
    </ToastContext.Provider>
  );
};
