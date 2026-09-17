import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getHealthCheck, HealthCheckData } from '../services/api';

export const HomePage: React.FC = () => {
  const { isAuthenticated, principal, logout } = useAuth();

  const [health, setHealth] = useState<HealthCheckData | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    getHealthCheck()
      .then((res) => {
        setHealth(res.data);
        setLoadingHealth(false);
      })
      .catch((err) => {
        setHealthError(err.message || 'Không thể kết nối đến Backend');
        setLoadingHealth(false);
      });
  }, []);

  return (
    <main className="page-container">
      <header className="app-header">
        <div className="brand-section">
          <h1>🏢 Co-Space Working</h1>
          <p>Hệ thống đặt chỗ làm việc thông minh (Co-Workspace Booking)</p>
        </div>

        <nav className="nav-actions">
          {isAuthenticated && principal ? (
            <>
              <span className="user-status-text">
                Xin chào, <strong>{principal.fullName || principal.email || principal.id}</strong>{' '}
                <span
                  className={`badge ${principal.role === 'ADMIN' ? 'badge-admin' : 'badge-customer'}`}
                >
                  {principal.role}
                </span>
              </span>
              {principal.role === 'ADMIN' && (
                <Link to="/admin" className="btn btn-outline">
                  Khu vực Quản trị
                </Link>
              )}
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={() => logout('userAction')}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-primary">
                Đăng nhập
              </Link>
              <Link to="/register" className="btn btn-outline">
                Đăng ký
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginTop: 0, color: 'var(--color-primary)' }}>
          Trang Chào Công Khai — Nghiệm Thu Xác Thực
        </h2>
        <p style={{ color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
          Hệ thống đã triển khai hoàn thiện luồng Xác thực và Phân quyền người dùng (Task 2005). Các
          tính năng tìm kiếm và đặt phòng sẽ tiếp tục được tích hợp ở các bước tiếp theo.
        </p>

        {isAuthenticated && principal ? (
          <div className="alert alert-success" style={{ marginTop: '1rem' }}>
            Bạn đang đăng nhập với vai trò: <strong>{principal.role}</strong> (ID: {principal.id}).
          </div>
        ) : (
          <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
            Bạn chưa đăng nhập. Vui lòng đăng nhập để trải nghiệm đầy đủ các tính năng.
          </div>
        )}
      </section>

      <section className="card">
        <h3 style={{ fontSize: '1.125rem', marginTop: 0 }}>
          Kiểm tra trạng thái Backend (Health Check)
        </h3>

        {loadingHealth && <p>⏳ Đang kết nối tới Backend...</p>}

        {healthError && (
          <div className="health-box health-box-error">❌ Lỗi kết nối: {healthError}</div>
        )}

        {health && (
          <div className="health-box health-box-success">
            <p style={{ margin: 0, fontWeight: 'bold' }}>✅ Kết nối Backend thành công!</p>
            <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.2rem', color: '#1f2937' }}>
              <li>
                <strong>Trạng thái:</strong> {health.status}
              </li>
              <li>
                <strong>Dịch vụ:</strong> {health.service}
              </li>
              <li>
                <strong>Uptime:</strong> {health.uptime.toFixed(1)} giây
              </li>
              <li>
                <strong>Thời gian server:</strong> {health.timestamp}
              </li>
            </ul>
          </div>
        )}
      </section>

      <footer
        style={{
          marginTop: '3rem',
          fontSize: '0.875rem',
          color: 'var(--color-text-muted)',
          textAlign: 'center',
        }}
      >
        Co-Space Working Platform — Auth & RBAC Verification.
      </footer>
    </main>
  );
};
