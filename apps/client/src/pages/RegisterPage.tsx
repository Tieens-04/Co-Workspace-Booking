import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { authApi } from '../services/auth.api';
import { ApiErrorResponse, RegisterRequest } from '../types/auth';
import { registerSchema } from '../utils/validation';
import styles from './Auth.module.css';
import { Boxes, User, Mail, Phone, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});
    setGeneralError(null);

    // Client-side validation
    const validationResult = registerSchema.safeParse({
      fullName,
      email,
      phoneNumber: phoneNumber.trim() || undefined,
      password,
      confirmPassword,
    });

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

    // Prepare strict payload: strictly no confirmPassword, no role, no extra fields
    const sanitizedEmail = email.trim().toLowerCase();
    const payload: RegisterRequest = {
      fullName: fullName.trim(),
      email: sanitizedEmail,
      password, // never trim password
      ...(phoneNumber.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
    };

    try {
      await authApi.register(payload);

      // On register success -> navigate to /login with prefilled email and success notice
      navigate('/login', {
        state: {
          email: sanitizedEmail,
          successMessage: 'Đăng ký tài khoản thành công! Vui lòng đăng nhập.',
        },
      });
    } catch (err: unknown) {
      setIsSubmitting(false);

      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setGeneralError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.');
          return;
        }

        const data = err.response.data as ApiErrorResponse;
        if (data?.code === 'EMAIL_ALREADY_EXISTS' || err.response.status === 409) {
          setFieldErrors((prev) => ({ ...prev, email: 'Email đã được sử dụng' }));
          setGeneralError('Email đã được sử dụng');
        } else if (data?.code === 'VALIDATION_ERROR' && Array.isArray(data.details)) {
          const errors: Record<string, string> = {};
          data.details.forEach((item) => {
            if (item.field && item.message) {
              errors[item.field] = item.message;
            }
          });
          setFieldErrors(errors);
          setGeneralError(data.message || 'Dữ liệu đầu vào không hợp lệ');
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
      <div className={`card auth-card ${styles.card} ${styles.cardRegister}`}>
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
          <h1 className={`auth-title ${styles.title}`}>Đăng ký tài khoản</h1>
          <p className={`auth-subtitle ${styles.subtitle}`}>Tạo tài khoản khách hàng để bắt đầu đặt chỗ</p>
        </div>

        {generalError && (
          <div className={`alert alert-danger ${styles.alertDanger}`} role="alert">
            <AlertCircle size={18} className={styles.alertIcon} />
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          <div className={`form-group ${styles.field}`}>
            <label htmlFor="reg-fullName" className={`form-label ${styles.label}`}>
              Họ và tên <span className={styles.requiredStar} aria-hidden="true">*</span>
            </label>
            <div className={styles.inputWrapper}>
              <div className={styles.inputIcon}>
                <User size={16} />
              </div>
              <input
                id="reg-fullName"
                type="text"
                className={`form-control ${styles.input} ${styles.inputWithIcon} ${fieldErrors.fullName ? `has-error ${styles.inputError}` : ''}`}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                autoComplete="name"
                aria-describedby={fieldErrors.fullName ? 'reg-fullName-error' : undefined}
                disabled={isSubmitting}
                required
              />
            </div>
            {fieldErrors.fullName && (
              <div id="reg-fullName-error" className={`field-error ${styles.errorMessage}`} role="alert">
                {fieldErrors.fullName}
              </div>
            )}
          </div>

          <div className={`form-group ${styles.field}`}>
            <label htmlFor="reg-email" className={`form-label ${styles.label}`}>
              Email <span className={styles.requiredStar} aria-hidden="true">*</span>
            </label>
            <div className={styles.inputWrapper}>
              <div className={styles.inputIcon}>
                <Mail size={16} />
              </div>
              <input
                id="reg-email"
                type="email"
                className={`form-control ${styles.input} ${styles.inputWithIcon} ${fieldErrors.email ? `has-error ${styles.inputError}` : ''}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@congty.com"
                autoComplete="email"
                aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined}
                disabled={isSubmitting}
                required
              />
            </div>
            {fieldErrors.email && (
              <div id="reg-email-error" className={`field-error ${styles.errorMessage}`} role="alert">
                {fieldErrors.email}
              </div>
            )}
          </div>

          <div className={`form-group ${styles.field}`}>
            <label htmlFor="reg-phone" className={`form-label ${styles.label}`}>
              Số điện thoại <span className={styles.optionalTag}>(Tùy chọn)</span>
            </label>
            <div className={styles.inputWrapper}>
              <div className={styles.inputIcon}>
                <Phone size={16} />
              </div>
              <input
                id="reg-phone"
                type="tel"
                className={`form-control ${styles.input} ${styles.inputWithIcon} ${fieldErrors.phoneNumber ? `has-error ${styles.inputError}` : ''}`}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="0912345678"
                autoComplete="tel"
                aria-describedby={fieldErrors.phoneNumber ? 'reg-phone-error' : undefined}
                disabled={isSubmitting}
              />
            </div>
            {fieldErrors.phoneNumber && (
              <div id="reg-phone-error" className={`field-error ${styles.errorMessage}`} role="alert">
                {fieldErrors.phoneNumber}
              </div>
            )}
          </div>

          <div className={`form-group ${styles.field}`}>
            <label htmlFor="reg-password" className={`form-label ${styles.label}`}>
              Mật khẩu <span className={styles.requiredStar} aria-hidden="true">*</span>
            </label>
            <div className={`password-input-wrapper ${styles.inputWrapper}`}>
              <div className={styles.inputIcon}>
                <Lock size={16} />
              </div>
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                className={`form-control ${styles.input} ${styles.inputWithIcon} ${styles.inputWithToggle} ${fieldErrors.password ? `has-error ${styles.inputError}` : ''}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự, tối đa 72 bytes"
                autoComplete="new-password"
                aria-describedby={fieldErrors.password ? 'reg-password-error' : undefined}
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
              <div id="reg-password-error" className={`field-error ${styles.errorMessage}`} role="alert">
                {fieldErrors.password}
              </div>
            )}
          </div>

          <div className={`form-group ${styles.field}`}>
            <label htmlFor="reg-confirmPassword" className={`form-label ${styles.label}`}>
              Xác nhận mật khẩu <span className={styles.requiredStar} aria-hidden="true">*</span>
            </label>
            <div className={`password-input-wrapper ${styles.inputWrapper}`}>
              <div className={styles.inputIcon}>
                <Lock size={16} />
              </div>
              <input
                id="reg-confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                className={`form-control ${styles.input} ${styles.inputWithIcon} ${styles.inputWithToggle} ${fieldErrors.confirmPassword ? `has-error ${styles.inputError}` : ''}`}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu"
                autoComplete="new-password"
                aria-describedby={
                  fieldErrors.confirmPassword ? 'reg-confirmPassword-error' : undefined
                }
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                className={`toggle-password-btn ${styles.toggleBtn}`}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? 'Ẩn mật khẩu nhập lại' : 'Hiện mật khẩu nhập lại'}
                disabled={isSubmitting}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <div id="reg-confirmPassword-error" className={`field-error ${styles.errorMessage}`} role="alert">
                {fieldErrors.confirmPassword}
              </div>
            )}
          </div>

          <button type="submit" className={`btn btn-primary btn-block ${styles.submitBtn}`} disabled={isSubmitting}>
            {isSubmitting ? 'Đang tạo tài khoản...' : 'Đăng ký'}
          </button>
        </form>

        <div className={`auth-footer ${styles.footer}`}>
          Đã có tài khoản?{' '}
          <Link to="/login" className={`auth-link ${styles.footerLink}`}>
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    </main>
  );
};
