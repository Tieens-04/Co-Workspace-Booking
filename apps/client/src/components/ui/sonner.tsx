import type * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useTheme } from '@/hooks/useTheme';

/** App toaster; follows the resolved light/dark theme instead of next-themes. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
