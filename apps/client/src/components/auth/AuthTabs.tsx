import { Link, useLocation } from 'react-router-dom';
import { m } from 'motion/react';
import { DURATION, EASE_EDITORIAL } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface AuthTabsProps {
  className?: string;
}

export function AuthTabs({ className }: AuthTabsProps) {
  const location = useLocation();
  const isLogin = location.pathname === '/login';
  const isRegister = location.pathname === '/register';

  if (!isLogin && !isRegister) {
    return null;
  }

  return (
    <div
      role="tablist"
      aria-label="Chuyển đổi đăng nhập hoặc đăng ký"
      data-testid="auth-tabs"
      className={cn(
        'grid grid-cols-2 rounded-xl bg-muted/70 p-1 text-sm font-medium border border-border/40 shadow-xs',
        className,
      )}
    >
      <Link
        to="/login"
        role="tab"
        aria-selected={isLogin}
        data-testid="auth-tab-login"
        className={cn(
          'relative flex h-10 items-center justify-center rounded-lg px-4 text-center transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring',
          isLogin ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {isLogin && (
          <m.span
            layoutId="auth-active-tab-pill"
            aria-hidden="true"
            className="absolute inset-0 rounded-lg bg-background shadow-xs border border-border/50"
            transition={{ duration: DURATION.base, ease: EASE_EDITORIAL }}
          />
        )}
        <span className="relative z-10">Đăng nhập</span>
      </Link>

      <Link
        to="/register"
        role="tab"
        aria-selected={isRegister}
        data-testid="auth-tab-register"
        className={cn(
          'relative flex h-10 items-center justify-center rounded-lg px-4 text-center transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring',
          isRegister ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {isRegister && (
          <m.span
            layoutId="auth-active-tab-pill"
            aria-hidden="true"
            className="absolute inset-0 rounded-lg bg-background shadow-xs border border-border/50"
            transition={{ duration: DURATION.base, ease: EASE_EDITORIAL }}
          />
        )}
        <span className="relative z-10">Đăng ký</span>
      </Link>
    </div>
  );
}
