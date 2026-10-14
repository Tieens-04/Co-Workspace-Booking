import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../services/auth.api';
import { ApiErrorResponse } from '../types/auth';
import { loginSchema } from '../utils/validation';
import styles from './Auth.module.css';
import { Boxes, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, sessionExpired, clearSessionExpiredNotice } = useAuth();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Handle prefilled email and notifications from location.state
  useEffect(() => {
    if (location.state?.email) {
      setEmail(location.state.email);
    }
    if (location.state?.successMessage) {
      setSuccessNotice(location.state.successMessage);
    }
  }, [location.state]);

  const showSessionNotice = sessionExpired || location.state?.sessionExpired;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});
    setGeneralError(null);
    setSuccessNotice(null);
    clearSessionExpiredNotice();

    // Client-side validation
    const validationResult = loginSchema.safeParse({ email, password });
    if (!validationResult.success) {
      const errors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        const fieldName = issue.path[0];
        if (typeof fieldName === 'string' && !errors[fieldName]) {
          errors[fieldName] = issue.message;
        }
      });
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await authApi.login({
        email: email.trim().toLowerCase(),
        password,
      });

      const { accessToken, user } = response.data;
      if (!login(accessToken, user)) {
        setIsSubmitting(false);
        setGeneralError(
          'Không thể lưu phiên đăng nhập trên trình duyệt. Vui lòng kiểm tra cài đặt lưu trữ và thử lại.',
        );
        return;
      }

      // Navigate according to role
      if (user.role === 'ADMIN') {
        navigate('/admin', { replace: true });
      } else {
        const from = location.state?.from;
        const isSafeRoomPath = typeof from === 'string' && /^\/rooms\/[a-zA-Z0-9_-]+$/.test(from);
        const isSafeBookingHistoryPath = from === '/bookings';
        const isSafeBookingDetailPath =
          typeof from === 'string' &&
          /^\/bookings\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            from,
          );
        const isSafePath = isSafeRoomPath || isSafeBookingHistoryPath || isSafeBookingDetailPath;
        navigate(isSafePath ? from : '/', { replace: true });
      }
    } catch (err: unknown) {
      setIsSubmitting(false);

      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setGeneralError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.');
          return;
        }

        const data = err.response.data as ApiErrorResponse;
        if (data?.code === 'INVALID_CREDENTIALS' || err.response.status === 401) {
          setGeneralError('Email hoặc mật khẩu không chính xác');
        } else if (data?.code === 'VALIDATION_ERROR' && Array.isArray(data.details)) {
          const errors: Record<string, string> = {};
          data.details.forEach((item) => {
            if (item.field && item.message) {
              errors[item.field] = item.message;
            }
          });
          setFieldErrors(errors);
          setGeneralError(data.message || 'Dữ liệu không hợp lệ');
        } else {
          setGeneralError(data?.message || 'Đã có lỗi xảy ra. Vui lòng thử lại.');
        }
      } else {
        setGeneralError('Đã có lỗi xảy ra. Vui lòng thử lại.');
      }
    }
  };

  return (
    <main className={`auth-container ${styles.container}`}>
      <div className={`card auth-card ${styles.card}`}>
        <div className={`auth-header ${styles.header}`}>
          <Link to="/" className={`auth-brand ${styles.brand}`} aria-label="Về trang chủ Co-Space">
            <div className={styles.brandIcon}>
              <Boxes size={20} strokeWidth={2.2} />
            </div>
            <div className={styles.brandText}>
              <span>Co-Space</span>
              <span className={styles.brandSub}>Working</span>
            </div>
          </Link>
          <h1 className={`auth-title ${styles.title}`}>Đăng nhập tài khoản</h1>
          <p className={`auth-subtitle ${styles.subtitle}`}>Nhập thông tin xác thực để truy cập hệ thống</p>
        </div>

        {showSessionNotice && (
          <div className={`alert alert-danger ${styles.alertDanger}`} role="alert">
            <AlertCircle size={18} className={styles.alertIcon} />
            <span>Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.</span>
          </div>
        )}

        {successNotice && (
          <div className={`alert alert-success ${styles.alertSuccess}`} role="status">
            <CheckCircle2 size={18} className={styles.alertIcon} />
            <span>{successNotice}</span>
          </div>
        )}

        {generalError && (
          <div className={`alert alert-danger ${styles.alertDanger}`} role="alert">
            <AlertCircle size={18} className={styles.alertIcon} />
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          <div className={`form-group ${styles.field}`}>
            <label htmlFor="login-email" className={`form-label ${styles.label}`}>
              Email <span className={styles.requiredStar} aria-hidden="true">*</span>
            </label>
            <div className={styles.inputWrapper}>
              <div className={styles.inputIcon}>
                <Mail size={16} />
              </div>
              <input
                id="login-email"
                type="email"
                className={`form-control ${styles.input} ${styles.inputWithIcon} ${fieldErrors.email ? `has-error ${styles.inputError}` : ''}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@congty.com"
                autoComplete="username"
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                disabled={isSubmitting}
                required
              />
            </div>
            {fieldErrors.email && (
              <div id="login-email-error" className={`field-error ${styles.errorMessage}`} role="alert">
                {fieldErrors.email}
              </div>
            )}
          </div>

          <div className={`form-group ${styles.field}`}>
            <label htmlFor="login-password" className={`form-label ${styles.label}`}>
              Mật khẩu <span className={styles.requiredStar} aria-hidden="true">*</span>
            </label>
            <div className={`password-input-wrapper ${styles.inputWrapper}`}>
              <div className={styles.inputIcon}>
                <Lock size={16} />
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className={`form-control ${styles.input} ${styles.inputWithIcon} ${styles.inputWithToggle} ${fieldErrors.password ? `has-error ${styles.inputError}` : ''}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                className={`toggle-password-btn ${styles.toggleBtn}`}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                disabled={isSubmitting}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.password && (
              <div id="login-password-error" className={`field-error ${styles.errorMessage}`} role="alert">
                {fieldErrors.password}
              </div>
            )}
          </div>

          <button type="submit" className={`btn btn-primary btn-block ${styles.submitBtn}`} disabled={isSubmitting}>
            {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className={`auth-footer ${styles.footer}`}>
          Chưa có tài khoản?{' '}
          <Link to="/register" className={`auth-link ${styles.footerLink}`}>
            Đăng ký ngay
          </Link>
        </div>
      </div>
    </main>
  );
};
