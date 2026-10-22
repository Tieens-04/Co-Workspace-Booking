import { useContext } from 'react';
import { ToastContext, ToastContextValue } from '../context/toast-context-base';

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: () => {},
      removeToast: () => {},
    };
  }
  return context;
}
