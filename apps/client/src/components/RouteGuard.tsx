import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, LoaderCircle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from './BrandMark';
import { useAuth } from '../hooks/useAuth';
import { sanitizeHistoryState } from '../utils/history';

const RouteLoading: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    className="flex min-h-[50vh] items-center justify-center gap-2 bg-background text-sm text-muted-foreground"
  >
    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
    Đang tải...
  </div>
);

export const GuestRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, principal, isLoading } = useAuth();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (isAuthenticated && principal) {
    if (principal.role === 'ADMIN') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const CustomerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, principal, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (!isAuthenticated || !principal) {
    sanitizeHistoryState();
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (principal.role !== 'CUSTOMER') {
    sanitizeHistoryState();
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, principal, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (!isAuthenticated || !principal) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (principal.role !== 'ADMIN') {
    return (
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <div className="container-page flex h-16 items-center">
          <BrandMark />
        </div>
        <main
          id="main-content"
          className="container-page flex flex-1 items-center justify-center py-12 md:py-20"
        >
          <div
            role="alert"
            className="grid w-full max-w-[560px] gap-5 rounded-2xl border bg-card p-6 text-card-foreground shadow-soft sm:p-10"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex size-11 items-center justify-center rounded-full border border-status-cancelled-border bg-status-cancelled-bg text-status-cancelled">
                <ShieldAlert aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </span>
              <p className="eyebrow">Khu vực quản trị</p>
            </div>
            <h1 className="text-h2 font-bold">403 - Không có quyền truy cập</h1>
            <p className="text-muted-foreground">
              Bạn không có quyền truy cập vào khu vực quản trị. Trang này chỉ dành riêng cho Quản
              trị viên (ADMIN).
            </p>
            <p className="text-sm text-muted-foreground">
              Bạn vẫn đang đăng nhập và có thể tiếp tục đặt phòng như bình thường.
            </p>
            <div className="flex flex-wrap gap-2 border-t pt-5">
              <Button asChild>
                <Link to="/">
                  <ArrowLeft aria-hidden="true" />
                  Về trang chủ
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/rooms">Khám phá phòng</Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return <>{children}</>;
};
