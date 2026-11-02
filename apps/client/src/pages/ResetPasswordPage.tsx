import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/common/Field';
import { AuthNotice } from '../components/auth/AuthNotice';
import { PasswordInput } from '../components/auth/PasswordInput';
import { authApi } from '../services/auth.api';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Sets a new password from the emailed one-time link (`/reset-password?token=...`). */
export const ResetPasswordPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Keep the token in memory only and drop it from the address bar/history right away.
  const [token] = useState(() => searchParams.get('token') ?? '');
  useEffect(() => {
    if (searchParams.has('token')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tokenLooksValid = TOKEN_PATTERN.test(token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await authApi.resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data
        ?.message;
      setError(message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <p className="eyebrow">Khôi phục tài khoản</p>
        <h1 className="text-h1 font-bold tracking-[-0.035em]">Đặt lại mật khẩu</h1>
      </div>

      <Card className="gap-5 px-6 py-7 shadow-soft sm:px-8">
        {done ? (
          <div className="grid gap-4" data-testid="reset-password-done">
            <AuthNotice tone="success">
              Đặt lại mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.
            </AuthNotice>
            <Button asChild size="lg">
              <Link to="/login">Đăng nhập</Link>
            </Button>
          </div>
        ) : !tokenLooksValid ? (
          <div className="grid gap-4" data-testid="reset-password-invalid-link">
            <AuthNotice tone="danger">
              Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.
            </AuthNotice>
            <Button asChild variant="outline">
              <Link to="/forgot-password">Gửi lại liên kết</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="grid gap-5">
            {error && <AuthNotice tone="danger">{error}</AuthNotice>}
            <Field id="reset-new-password" label="Mật khẩu mới" hint="Ít nhất 8 ký tự.">
              <PasswordInput
                visible={showPassword}
                onToggleVisible={() => setShowPassword((v) => !v)}
                showLabel="Hiện mật khẩu"
                hideLabel="Ẩn mật khẩu"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
            </Field>
            <Field id="reset-confirm-password" label="Nhập lại mật khẩu mới">
              <PasswordInput
                visible={showPassword}
                onToggleVisible={() => setShowPassword((v) => !v)}
                showLabel="Hiện mật khẩu"
                hideLabel="Ẩn mật khẩu"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {isSubmitting ? 'Đang đặt lại...' : 'Đặt lại mật khẩu'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
};
