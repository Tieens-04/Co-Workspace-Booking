import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/common/Field';
import { AuthNotice } from '../components/auth/AuthNotice';
import { authApi } from '../services/auth.api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Requests a reset link. The confirmation never reveals whether the email is registered. */
export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!EMAIL_PATTERN.test(email.trim())) {
      setFieldError('Email không đúng định dạng');
      return;
    }
    setFieldError(null);
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      setSentMessage(res.message);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data
        ?.message;
      setError(message || 'Không thể gửi yêu cầu. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <p className="eyebrow">Khôi phục tài khoản</p>
        <h1 className="text-h1 font-bold tracking-[-0.035em]">Quên mật khẩu</h1>
        <p className="text-[0.9375rem] text-muted-foreground">
          Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu (hiệu lực 30 phút).
        </p>
      </div>

      <Card className="gap-5 px-6 py-7 shadow-soft sm:px-8">
        {sentMessage ? (
          <div data-testid="forgot-password-sent">
            <AuthNotice tone="success">{sentMessage}</AuthNotice>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="grid gap-5">
            {error && <AuthNotice tone="danger">{error}</AuthNotice>}
            <Field id="forgot-email" label="Email" error={fieldError}>
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
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {isSubmitting ? 'Đang gửi...' : 'Gửi liên kết đặt lại'}
            </Button>
          </form>
        )}
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Nhớ ra mật khẩu?{' '}
        <Link
          to="/login"
          className="font-medium text-foreground underline decoration-input underline-offset-4 hover:decoration-foreground"
        >
          Quay lại đăng nhập
        </Link>
      </p>
    </div>
  );
};
