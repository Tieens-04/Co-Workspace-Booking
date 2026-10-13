import React from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Clock, Shield, LogOut, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import styles from './AppHeader.module.css';

export const AppHeader: React.FC = () => {
  const { isAuthenticated, principal, logout } = useAuth();

  const displayName = principal?.fullName || principal?.email || principal?.id || '';
  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'U';

  return (
    <header className={`${styles.header} app-header`}>
      <div className={styles.container}>
        <Link to="/" className={styles.brand} aria-label="Trang chủ Co-Space">
          <div className={styles.brandIcon}>
            <Boxes size={18} strokeWidth={2.2} />
          </div>
          <div className={styles.brandText}>
            <span>Co-Space</span>
            <span className={styles.brandSub}>Working</span>
          </div>
        </Link>

        <nav className={`${styles.nav} nav-actions user-nav`} aria-label="Điều hướng chính">
          {isAuthenticated && principal ? (
            <>
              <div className={`${styles.userStatus} user-status-text`}>
                <div className={styles.userAvatar}>{initial}</div>
                <span>
                  Xin chào, <strong>{displayName}</strong>
                </span>
                <span
                  className={`${styles.badge} ${
                    principal.role === 'ADMIN' ? `${styles.badgeAdmin} badge-admin` : `${styles.badgeCustomer} badge-customer`
                  } badge`}
                >
                  {principal.role}
                </span>
              </div>

              {principal.role === 'ADMIN' && (
                <Link to="/admin" className={`${styles.navLink} btn btn-outline`}>
                  <Shield size={16} />
                  <span>Khu vực Quản trị</span>
                </Link>
              )}

              {principal.role === 'CUSTOMER' && (
                <Link to="/bookings" className={`${styles.navLink} btn btn-outline`}>
                  <Clock size={16} />
                  <span>Lịch sử đặt phòng</span>
                </Link>
              )}

              <button
                type="button"
                className={`${styles.btnLogout} btn btn-danger-outline`}
                onClick={() => logout('userAction')}
              >
                <LogOut size={16} />
                <span>Đăng xuất</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={`${styles.btnPrimary} btn btn-primary`}>
                <LogIn size={16} />
                <span>Đăng nhập</span>
              </Link>
              <Link to="/register" className={`${styles.navLink} btn btn-outline`}>
                <UserPlus size={16} />
                <span>Đăng ký</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
