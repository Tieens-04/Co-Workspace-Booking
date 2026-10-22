import { useContext } from 'react';
import { ThemeContext, ThemeContextValue } from '../context/theme-context-base';

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: () => {},
    };
  }
  return context;
}
