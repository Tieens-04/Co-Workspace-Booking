import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AnimatePresence, m } from 'motion/react';
import { DURATION, EASE_EDITORIAL } from '@/lib/motion';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../services/auth.api';
import { ApiErrorResponse } from '../types/auth';
import { loginSchema } from '../utils/validation';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/common/Field';
import { Stagger, StaggerItem } from '../components/motion/Stagger';
import { AuthNotice } from '../components/auth/AuthNotice';
import { PasswordInput } from '../components/auth/PasswordInput';

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
    <Stagger stagger={0.06} className="grid gap-8">
      <StaggerItem className="grid gap-3">
        <p className="eyebrow">Chào mừng trở lại</p>
        <h1 className="text-h1 font-bold tracking-[-0.035em]">Đăng nhập tài khoản</h1>
        <p className="text-[0.9375rem] text-muted-foreground">
          Nhập thông tin xác thực để truy cập hệ thống
        </p>
      </StaggerItem>

      <StaggerItem>
        <Card className="gap-5 px-6 py-7 shadow-soft sm:px-8">
          <AnimatePresence mode="wait">
            {showSessionNotice && (
              <m.div
                key="session-notice"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: DURATION.base, ease: EASE_EDITORIAL }}
              >
                <AuthNotice tone="warning">
                  Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.
                </AuthNotice>
              </m.div>
            )}

            {successNotice && (
              <m.div
                key="success-notice"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: DURATION.base, ease: EASE_EDITORIAL }}
              >
                <AuthNotice tone="success">{successNotice}</AuthNotice>
              </m.div>
            )}

            {generalError && (
              <m.div
                key="general-error"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: DURATION.base, ease: EASE_EDITORIAL }}
              >
                <AuthNotice tone="danger">{generalError}</AuthNotice>
              </m.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} noValidate className="grid gap-5">
            <Field
              id="login-email"
              label={
                <>
                  Email{' '}
                  <span aria-hidden="true" className="-ml-1 text-muted-foreground">
                    *
                  </span>
                </>
              }
              error={fieldErrors.email}
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@congty.com"
                autoComplete="username"
                disabled={isSubmitting}
                required
              />
            </Field>

            <Field
              id="login-password"
              label={
                <>
                  Mật khẩu{' '}
                  <span aria-hidden="true" className="-ml-1 text-muted-foreground">
                    *
                  </span>
                </>
              }
              error={fieldErrors.password}
            >
              <PasswordInput
                visible={showPassword}
                onToggleVisible={() => setShowPassword((prev) => !prev)}
                showLabel="Hiện mật khẩu"
                hideLabel="Ẩn mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                disabled={isSubmitting}
                required
              />
            </Field>

            <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </form>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <p className="text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{' '}
          <Link
            to="/register"
            className="font-medium text-foreground underline decoration-input underline-offset-4 transition-colors duration-150 hover:decoration-foreground"
          >
            Đăng ký ngay
          </Link>
        </p>
      </StaggerItem>
    </Stagger>
  );
};
