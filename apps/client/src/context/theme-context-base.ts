import { createContext } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

/** Must match the key read by the anti-flash script in index.html. */
export const THEME_STORAGE_KEY = 'cospace-theme';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
