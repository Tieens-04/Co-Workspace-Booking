import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const AdminPage: React.FC = () => {
  const { principal, logout } = useAuth();

  return (
    <main className="page-container">
      <header className="app-header">
        <div className="brand-section">
          <h1>🏢 Co-Space Working — Quản Trị Hệ Thống</h1>
          <p>Khu vực dành riêng cho Quản trị viên (ADMIN)</p>
        </div>

        <nav className="nav-actions">
          <Link to="/" className="btn btn-outline">
            Về trang chủ
          </Link>
          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={() => logout('userAction')}
          >
            Đăng xuất
          </button>
        </nav>
      </header>

      <section className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginTop: 0, color: 'var(--color-primary)' }}>
          Trang Quản Trị Tối Thiểu (Admin Acceptance)
        </h2>
        <p style={{ color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
          Bạn đang truy cập với quyền hạn cao nhất của hệ thống. Trang này dùng để nghiệm thu phân
          quyền RBAC theo hợp đồng (Task 2005). Các bảng điều khiển quản lý phòng, đặt chỗ và thống
          kê sẽ được hoàn thiện ở các tác vụ tiếp theo.
        </p>

        <div className="alert alert-success">
          <strong>Thông tin phiên quản trị:</strong>
          <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.2rem' }}>
            <li>
              <strong>ID Quản trị viên:</strong> {principal?.id}
            </li>
            <li>
              <strong>Vai trò:</strong> <span className="badge badge-admin">{principal?.role}</span>
            </li>
            {principal?.email && (
              <li>
                <strong>Email:</strong> {principal.email}
              </li>
            )}
            {principal?.fullName && (
              <li>
                <strong>Họ tên:</strong> {principal.fullName}
              </li>
            )}
          </ul>
        </div>
      </section>

      <footer
        style={{
          marginTop: '3rem',
          fontSize: '0.875rem',
          color: 'var(--color-text-muted)',
          textAlign: 'center',
        }}
      >
        Co-Space Working — Admin Dashboard Stub.
      </footer>
    </main>
  );
};
