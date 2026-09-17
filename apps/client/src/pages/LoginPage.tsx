import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../services/auth.api';
import { ApiErrorResponse } from '../types/auth';
import { loginSchema } from '../utils/validation';

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
        navigate('/', { replace: true });
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
    <main className="auth-container">
      <div className="card auth-card">
        <div className="auth-header">
          <Link to="/" className="auth-brand">
            🏢 Co-Space Working
          </Link>
          <h1 className="auth-title">Đăng nhập tài khoản</h1>
          <p className="auth-subtitle">Nhập thông tin xác thực để truy cập hệ thống</p>
        </div>

        {showSessionNotice && (
          <div className="alert alert-danger" role="alert">
            Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.
          </div>
        )}

        {successNotice && (
          <div className="alert alert-success" role="status">
            {successNotice}
          </div>
        )}

        {generalError && (
          <div className="alert alert-danger" role="alert">
            {generalError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">
              Email <span aria-hidden="true">*</span>
            </label>
            <input
              id="login-email"
              type="email"
              className={`form-control ${fieldErrors.email ? 'has-error' : ''}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@congty.com"
              autoComplete="username"
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              disabled={isSubmitting}
              required
            />
            {fieldErrors.email && (
              <div id="login-email-error" className="field-error" role="alert">
                {fieldErrors.email}
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="login-password" className="form-label">
              Mật khẩu <span aria-hidden="true">*</span>
            </label>
            <div className="password-input-wrapper">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className={`form-control ${fieldErrors.password ? 'has-error' : ''}`}
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
                className="toggle-password-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                disabled={isSubmitting}
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
            {fieldErrors.password && (
              <div id="login-password-error" className="field-error" role="alert">
                {fieldErrors.password}
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
            {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="auth-footer">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="auth-link">
            Đăng ký ngay
          </Link>
        </div>
      </div>
    </main>
  );
};
