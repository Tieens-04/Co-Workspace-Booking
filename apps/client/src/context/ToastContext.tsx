import React, { useState, useCallback } from 'react';
import { ToastContext, ToastItem, ToastType } from './toast-context-base';

export type { ToastType, ToastItem, ToastContextValue } from './toast-context-base';

const DEFAULT_DURATION = 4000;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = DEFAULT_DURATION) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, message, type, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <div
        aria-label="Thông báo hệ thống"
        style={{
          position: 'fixed',
          top: '1.25rem',
          right: '1.25rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          maxWidth: '400px',
          width: 'calc(100% - 2.5rem)',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => {
          const isError = toast.type === 'error';
          const bgColor =
            toast.type === 'success'
              ? '#f0fff4'
              : toast.type === 'error'
                ? '#fff5f5'
                : toast.type === 'warning'
                  ? '#fffaf0'
                  : '#ebf8ff';
          const borderColor =
            toast.type === 'success'
              ? '#9ae6b4'
              : toast.type === 'error'
                ? '#feb2b2'
                : toast.type === 'warning'
                  ? '#fbd38d'
                  : '#bee3f8';
          const textColor =
            toast.type === 'success'
              ? '#22543d'
              : toast.type === 'error'
                ? '#742a2a'
                : toast.type === 'warning'
                  ? '#7b341e'
                  : '#2a4365';
          const icon =
            toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : toast.type === 'warning' ? '⚠' : 'ℹ';

          return (
            <div
              key={toast.id}
              role={isError ? 'alert' : 'status'}
              aria-live={isError ? 'assertive' : 'polite'}
              style={{
                pointerEvents: 'auto',
                padding: '0.875rem 1rem',
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                color: textColor,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '0.75rem',
                fontSize: '0.925rem',
                lineHeight: 1.4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                <span style={{ fontWeight: 'bold' }}>{icon}</span>
                <span>{toast.message}</span>
              </div>
              <button
                type="button"
                aria-label="Đóng thông báo"
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: textColor,
                  cursor: 'pointer',
                  fontSize: '1rem',
                  lineHeight: 1,
                  padding: '0.125rem 0.25rem',
                  opacity: 0.7,
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
