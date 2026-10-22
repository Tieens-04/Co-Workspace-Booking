import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Building2, Clock, LogIn, LogOut, Menu, Shield, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAuth } from '../hooks/useAuth';
import { BrandMark } from '../components/BrandMark';
import { ThemeToggle } from '../components/ThemeToggle';

export const AppHeader: React.FC = () => {
  const { isAuthenticated, principal, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Tokens may carry only an id; never greet the user with a raw UUID.
  const displayName = principal?.fullName || principal?.email || 'bạn';
  const initial = displayName.charAt(0).toUpperCase();
  const closeMenu = () => setMenuOpen(false);

  const roleLink =
    principal?.role === 'ADMIN'
      ? { to: '/admin', label: 'Khu vực Quản trị', Icon: Shield }
      : principal?.role === 'CUSTOMER'
        ? { to: '/bookings', label: 'Lịch sử đặt phòng', Icon: Clock }
        : null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
      <div className="container-page flex h-[72px] items-center justify-between gap-4">
        <BrandMark />

        <div className="flex items-center gap-1">
          <nav aria-label="Điều hướng chính" className="hidden items-center gap-1 md:flex">
            <NavLink
              to="/rooms"
              className={({ isActive }) =>
                cn(
                  'mr-2 inline-flex h-11 items-center rounded-md px-3 text-[0.9375rem] font-medium underline-offset-[6px] transition-colors duration-150 hover:underline',
                  isActive
                    ? 'text-foreground underline'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              Không gian
            </NavLink>
            {isAuthenticated && principal ? (
              <>
                {/* Greeting only where it fits (≥1024px); the mobile menu repeats it. */}
                <div className="mr-3 hidden items-center gap-2.5 text-sm text-muted-foreground lg:flex">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 items-center justify-center rounded-full border text-sm font-semibold text-foreground"
                  >
                    {initial}
                  </span>
                  <span>
                    Xin chào,{' '}
                    <strong
                      title={displayName}
                      className="inline-block max-w-[14rem] truncate align-bottom font-medium text-foreground"
                    >
                      {displayName}
                    </strong>
                  </span>
                  <Badge
                    variant="outline"
                    className="rounded-sm px-1.5 text-[0.625rem] font-semibold tracking-[0.08em]"
                  >
                    {principal.role}
                  </Badge>
                </div>
                {roleLink && (
                  <Button asChild variant="ghost">
                    <NavLink to={roleLink.to}>
                      <roleLink.Icon aria-hidden="true" />
                      <span>{roleLink.label}</span>
                    </NavLink>
                  </Button>
                )}
                <Button variant="ghost" onClick={() => logout('userAction')}>
                  <LogOut aria-hidden="true" />
                  <span>Đăng xuất</span>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost">
                  <Link to="/login">
                    <LogIn aria-hidden="true" />
                    <span>Đăng nhập</span>
                  </Link>
                </Button>
                <Button asChild>
                  <Link to="/register">
                    <UserPlus aria-hidden="true" />
                    <span>Đăng ký</span>
                  </Link>
                </Button>
              </>
            )}
          </nav>

          <ThemeToggle />

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Mở menu">
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(320px,85vw)] gap-0 p-0">
              <SheetHeader className="border-b p-6">
                <SheetTitle>Co-Space</SheetTitle>
                <SheetDescription>
                  {isAuthenticated && principal
                    ? `Xin chào, ${displayName} · ${principal.role}`
                    : 'Đặt phòng làm việc theo giờ'}
                </SheetDescription>
              </SheetHeader>
              <nav aria-label="Điều hướng di động" className="grid gap-1 p-4">
                <Button asChild variant="ghost" className="justify-start">
                  <NavLink to="/rooms" onClick={closeMenu}>
                    <Building2 aria-hidden="true" />
                    Không gian
                  </NavLink>
                </Button>
                {isAuthenticated && principal ? (
                  <>
                    {roleLink && (
                      <Button asChild variant="ghost" className="justify-start">
                        <NavLink to={roleLink.to} onClick={closeMenu}>
                          <roleLink.Icon aria-hidden="true" />
                          {roleLink.label}
                        </NavLink>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={() => {
                        closeMenu();
                        logout('userAction');
                      }}
                    >
                      <LogOut aria-hidden="true" />
                      Đăng xuất
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild variant="ghost" className="justify-start">
                      <Link to="/login" onClick={closeMenu}>
                        <LogIn aria-hidden="true" />
                        Đăng nhập
                      </Link>
                    </Button>
                    <Button asChild className="justify-start">
                      <Link to="/register" onClick={closeMenu}>
                        <UserPlus aria-hidden="true" />
                        Đăng ký
                      </Link>
                    </Button>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
