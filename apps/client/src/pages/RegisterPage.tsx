import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AnimatePresence, m } from 'motion/react';
import { DURATION, EASE_EDITORIAL } from '@/lib/motion';
import { authApi } from '../services/auth.api';
import { ApiErrorResponse, RegisterRequest } from '../types/auth';
import { registerSchema } from '../utils/validation';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/common/Field';
import { Stagger, StaggerItem } from '../components/motion/Stagger';
import { AuthNotice } from '../components/auth/AuthNotice';
import { PasswordInput } from '../components/auth/PasswordInput';

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

  const requiredMark = (
    <span aria-hidden="true" className="-ml-1 text-muted-foreground">
      *
    </span>
  );

  return (
    <Stagger stagger={0.06} className="grid gap-8">
      <StaggerItem className="grid gap-3">
        <p className="eyebrow">Tài khoản khách hàng</p>
        <h1 className="text-h1 font-bold tracking-[-0.035em]">Đăng ký tài khoản</h1>
        <p className="text-[0.9375rem] text-muted-foreground">
          Tạo tài khoản khách hàng để bắt đầu đặt chỗ
        </p>
      </StaggerItem>

      <StaggerItem>
        <Card className="gap-5 px-6 py-7 shadow-soft sm:px-8">
          <AnimatePresence mode="wait">
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
              id="reg-fullName"
              label={<>Họ và tên {requiredMark}</>}
              error={fieldErrors.fullName}
            >
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                autoComplete="name"
                disabled={isSubmitting}
                required
              />
            </Field>

            <Field id="reg-email" label={<>Email {requiredMark}</>} error={fieldErrors.email}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@congty.com"
                autoComplete="email"
                disabled={isSubmitting}
                required
              />
            </Field>

            <Field
              id="reg-phone"
              label={
                <>
                  Số điện thoại <span className="font-normal text-muted-foreground">(Tùy chọn)</span>
                </>
              }
              error={fieldErrors.phoneNumber}
            >
              <Input
                type="tel"
                className="tabular-nums"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="0912345678"
                autoComplete="tel"
                disabled={isSubmitting}
              />
            </Field>

            <Field
              id="reg-password"
              label={<>Mật khẩu {requiredMark}</>}
              error={fieldErrors.password}
            >
              <PasswordInput
                visible={showPassword}
                onToggleVisible={() => setShowPassword((prev) => !prev)}
                showLabel="Hiện mật khẩu"
                hideLabel="Ẩn mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự, tối đa 72 bytes"
                autoComplete="new-password"
                disabled={isSubmitting}
                required
              />
            </Field>

            <Field
              id="reg-confirmPassword"
              label={<>Xác nhận mật khẩu {requiredMark}</>}
              error={fieldErrors.confirmPassword}
            >
              <PasswordInput
                visible={showConfirmPassword}
                onToggleVisible={() => setShowConfirmPassword((prev) => !prev)}
                showLabel="Hiện mật khẩu nhập lại"
                hideLabel="Ẩn mật khẩu nhập lại"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu"
                autoComplete="new-password"
                disabled={isSubmitting}
                required
              />
            </Field>

            <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {isSubmitting ? 'Đang tạo tài khoản...' : 'Đăng ký'}
            </Button>
          </form>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <p className="text-center text-sm text-muted-foreground">
          Đã có tài khoản?{' '}
          <Link
            to="/login"
            className="font-medium text-foreground underline decoration-input underline-offset-4 transition-colors duration-150 hover:decoration-foreground"
          >
            Đăng nhập ngay
          </Link>
        </p>
      </StaggerItem>
    </Stagger>
  );
};
