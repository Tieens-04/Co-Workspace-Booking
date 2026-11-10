import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CircleAlert, LoaderCircle, MailCheck, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AuthNotice } from '../components/auth/AuthNotice';
import { authApi } from '../services/auth.api';
import { useAuth } from '../hooks/useAuth';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Public email verification endpoint (`/verify-email?token=...`).
 * Accessible to both logged-in and logged-out users. Requires an explicit user confirmation
 * action before calling POST to protect against aggressive link pre-fetching.
 */
export const VerifyEmailPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, refreshProfile } = useAuth();

  // Capture token in memory and drop it from address bar/history immediately
  const [token] = useState(() => searchParams.get('token') ?? '');
  useEffect(() => {
    if (searchParams.has('token')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenLooksValid = TOKEN_PATTERN.test(token);

  const handleConfirmVerification = async () => {
    if (isSubmitting || !tokenLooksValid) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await authApi.verifyEmail(token);
      setIsVerified(true);
      if (isAuthenticated) {
        await refreshProfile().catch(() => {});
      }
    } catch (err: any) {
      const message =
        err.response?.data?.message ||
        'Liên kết xác thực không hợp lệ hoặc đã hết hạn. Vui lòng thử gửi lại email xác thực mới.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container-page flex min-h-[calc(100vh-16rem)] items-center justify-center py-12 md:py-16">
      <div className="w-full max-w-md grid gap-6">
        <div className="grid gap-2 text-center">
          <p className="eyebrow">Xác thực tài khoản</p>
          <h1 className="text-h1 font-bold tracking-[-0.035em]">Xác thực Email</h1>
        </div>

        <Card className="p-6 sm:p-8 shadow-soft">
          {isVerified ? (
            <div className="grid gap-5 text-center" data-testid="verify-email-success">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-6" aria-hidden="true" />
              </div>
              <div className="grid gap-1.5">
                <h2 className="text-lg font-semibold">Xác thực email thành công!</h2>
                <p className="text-sm text-muted-foreground">
                  Địa chỉ email của bạn đã được xác nhận. Giờ đây bạn đã có thể bắt đầu đặt phòng làm việc tại Co-Space.
                </p>
              </div>
              <div className="grid gap-2 pt-2">
                <Button asChild size="lg" className="w-full">
                  <Link to="/rooms">Khám phá phòng làm việc</Link>
                </Button>
                {isAuthenticated ? (
                  <Button asChild variant="outline" size="lg" className="w-full">
                    <Link to="/account">Về trang tài khoản</Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="lg" className="w-full">
                    <Link to="/login">Đăng nhập ngay</Link>
                  </Button>
                )}
              </div>
            </div>
          ) : !tokenLooksValid ? (
            <div className="grid gap-5 text-center" data-testid="verify-email-invalid">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400">
                <CircleAlert className="size-6" aria-hidden="true" />
              </div>
              <div className="grid gap-1.5">
                <h2 className="text-lg font-semibold">Liên kết không hợp lệ</h2>
                <p className="text-sm text-muted-foreground">
                  Liên kết xác thực thiếu thông tin, không đúng định dạng hoặc đã hết hạn.
                </p>
              </div>
              <div className="grid gap-2 pt-2">
                {isAuthenticated ? (
                  <Button asChild size="lg" className="w-full">
                    <Link to="/account">Về trang tài khoản để gửi lại</Link>
                  </Button>
                ) : (
                  <Button asChild size="lg" className="w-full">
                    <Link to="/login">Đăng nhập vào tài khoản</Link>
                  </Button>
                )}
                <Button asChild variant="outline" size="lg" className="w-full">
                  <Link to="/rooms">Xem danh sách phòng</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 text-center" data-testid="verify-email-confirm">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                <MailCheck className="size-6" aria-hidden="true" />
              </div>

              {error && <AuthNotice tone="danger">{error}</AuthNotice>}

              <div className="grid gap-1.5">
                <h2 className="text-lg font-semibold">Hoàn tất xác thực email</h2>
                <p className="text-sm text-muted-foreground">
                  Nhấn nút bên dưới để hoàn tất việc xác thực địa chỉ email và kích hoạt đầy đủ tính năng đặt phòng.
                </p>
              </div>

              <Button
                type="button"
                size="lg"
                onClick={handleConfirmVerification}
                disabled={isSubmitting}
                className="w-full"
                data-testid="verify-email-confirm-btn"
              >
                {isSubmitting ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )}
                {isSubmitting ? 'Đang xác thực...' : 'Xác thực ngay'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
export default VerifyEmailPage;
