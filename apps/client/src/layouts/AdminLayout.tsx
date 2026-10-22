import { Suspense, useId, useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { m } from 'motion/react';
import { CalendarCheck, DoorOpen, LayoutDashboard, LogOut, Menu, Store } from 'lucide-react';
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
import { DURATION, EASE_EDITORIAL, enterTransition } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useAuth } from '../hooks/useAuth';
import { BrandMark } from '../components/BrandMark';
import { SkipLink } from '../components/SkipLink';
import { ScrollToTop } from '../components/ScrollToTop';
import { ThemeToggle } from '../components/ThemeToggle';
import { PageLoading } from '../components/PageLoading';

const NAV_ITEMS = [
  {
    to: '/admin/dashboard',
    label: 'Tổng quan',
    icon: LayoutDashboard,
    testId: 'admin-nav-dashboard',
    end: false,
  },
  { to: '/admin', label: 'Quản lý phòng', icon: DoorOpen, testId: 'admin-nav-rooms', end: true },
  {
    to: '/admin/bookings',
    label: 'Quản lý đặt phòng',
    icon: CalendarCheck,
    testId: 'admin-nav-bookings',
    end: false,
  },
];

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  // One indicator per nav instance; it slides to the active section on navigation.
  const indicatorId = useId();

  return (
    <nav aria-label="Điều hướng quản trị" className="grid gap-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon, testId, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          data-testid={testId}
          className={({ isActive }) =>
            cn(
              'relative flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground',
              isActive ? 'font-semibold text-primary hover:text-primary' : 'hover:bg-muted/70',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <m.span
                  aria-hidden="true"
                  layoutId={indicatorId}
                  className="absolute inset-0 rounded-md bg-primary/10 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary"
                  transition={{ duration: DURATION.base, ease: EASE_EDITORIAL }}
                />
              )}
              <Icon aria-hidden="true" className="relative size-4" />
              <span className="relative">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Current section label for the compact header (presentation only). */
function useSectionLabel(pathname: string): string {
  const match = NAV_ITEMS.find(({ to, end }) => matchPath({ path: to, end }, pathname));
  return match?.label ?? 'Quản trị';
}

/**
 * Admin shell: sticky sidebar on large screens, one compact header for every breakpoint
 * (menu sheet + wordmark below `lg`, section breadcrumb on `lg`), data-width content.
 */
export function AdminLayout() {
  const { principal, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const displayName = principal?.fullName || principal?.email || '';
  const sectionLabel = useSectionLabel(location.pathname);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <SkipLink />
      <ScrollToTop />
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card lg:flex">
        <div className="flex h-14 items-center justify-between gap-2 border-b px-5">
          <BrandMark to="/admin/dashboard" compact />
          <Badge
            variant="outline"
            className="rounded-sm border-primary/40 px-1.5 text-[0.625rem] font-semibold tracking-[0.08em] text-primary"
          >
            ADMIN
          </Badge>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <p className="eyebrow mb-2 px-3 text-[0.6875rem]">Quản trị</p>
          <AdminNav />
        </div>
        <div className="grid gap-2 border-t p-3">
          <div className="flex min-w-0 items-center gap-3 px-2 py-1">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary uppercase"
            >
              {(displayName || 'A').charAt(0)}
            </span>
            <div className="min-w-0">
              {/* Tokens may omit name/email; fall back to the role instead of an empty line. */}
              <p className="truncate text-sm font-semibold">{displayName || 'Quản trị viên'}</p>
              {displayName && (
                <p className="truncate text-xs text-muted-foreground">Quản trị viên</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="flex-1 justify-start">
              <NavLink to="/">
                <Store aria-hidden="true" />
                Trang khách
              </NavLink>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Đăng xuất"
              onClick={() => logout('userAction')}
            >
              <LogOut aria-hidden="true" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-1 lg:hidden">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="-ml-2" aria-label="Mở menu quản trị">
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(300px,85vw)] gap-0 p-0">
                <SheetHeader className="border-b p-6">
                  <SheetTitle>Quản trị Co-Space</SheetTitle>
                  <SheetDescription>{displayName || 'Quản trị viên'}</SheetDescription>
                </SheetHeader>
                <div className="grid gap-4 p-4">
                  <AdminNav onNavigate={() => setMenuOpen(false)} />
                  <div className="grid gap-2 border-t pt-4">
                    <Button asChild variant="ghost" className="justify-start">
                      <NavLink to="/" onClick={() => setMenuOpen(false)}>
                        <Store aria-hidden="true" />
                        Trang khách
                      </NavLink>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMenuOpen(false);
                        logout('userAction');
                      }}
                    >
                      <LogOut aria-hidden="true" />
                      Đăng xuất
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <BrandMark to="/admin/dashboard" compact />
          </div>

          <p className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
            <span className="text-muted-foreground">Quản trị</span>
            <span aria-hidden="true" className="text-muted-foreground">
              /
            </span>
            <span className="truncate font-semibold">{sectionLabel}</span>
          </p>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-[16rem] truncate text-sm text-muted-foreground sm:inline lg:hidden">
              {displayName}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          <Suspense fallback={<PageLoading />}>
            <m.div
              key={location.pathname}
              className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={enterTransition}
            >
              <Outlet />
            </m.div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
