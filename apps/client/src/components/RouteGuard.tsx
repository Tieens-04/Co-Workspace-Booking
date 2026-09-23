import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { sanitizeHistoryState } from '../utils/history';

export const GuestRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, principal, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading-container">Đang tải...</div>;
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
    return <div className="loading-container">Đang tải...</div>;
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
    return <div className="loading-container">Đang tải...</div>;
  }

  if (!isAuthenticated || !principal) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (principal.role !== 'ADMIN') {
    return (
      <main className="page-container">
        <div className="card forbidden-card" role="alert">
          <h1 className="error-title">403 - Không có quyền truy cập</h1>
          <p className="error-description">
            Bạn không có quyền truy cập vào khu vực quản trị. Trang này chỉ dành riêng cho Quản trị
            viên (ADMIN).
          </p>
          <div className="action-row">
            <Link to="/" className="btn btn-primary">
              Về trang chủ
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
};
