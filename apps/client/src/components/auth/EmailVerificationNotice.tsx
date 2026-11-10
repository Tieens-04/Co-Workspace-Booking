import React, { useState } from 'react';
import { Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { authApi } from '../../services/auth.api';
import { useToast } from '../../hooks/useToast';
import { cn } from '@/lib/utils';

export interface EmailVerificationNoticeProps {
  className?: string;
  title?: string;
  description?: string;
}

export const EmailVerificationNotice: React.FC<EmailVerificationNoticeProps> = ({
  className,
  title = 'Tài khoản chưa xác thực email',
  description = 'Bạn cần xác thực email trước khi có thể đặt phòng làm việc. Hãy kiểm tra hộp thư hoặc nhấn nút bên dưới để nhận lại liên kết xác thực.',
}) => {
  const { showToast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleResend = async () => {
    if (isSending) return;
    setIsSending(true);
    setSentMessage(null);
    setErrorMessage(null);

    try {
      const res = await authApi.resendVerification();
      const msg = res.message || 'Đã gửi email xác thực. Vui lòng kiểm tra hộp thư.';
      setSentMessage(msg);
      showToast(msg, 'success');
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Không thể gửi lại email xác thực lúc này. Vui lòng thử lại sau.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Alert
      role="status"
      data-testid="email-verification-notice"
      className={cn(
        'border-status-noshow-border bg-status-noshow-bg text-status-noshow rounded-lg border',
        className,
      )}
    >
      <Mail aria-hidden="true" className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="grid gap-2">
        <AlertTitle className="font-semibold text-amber-950 dark:text-amber-200">{title}</AlertTitle>
        <AlertDescription className="text-sm text-amber-900/90 dark:text-amber-300/90">
          {description}
        </AlertDescription>

        {sentMessage && (
          <p
            role="status"
            className="flex items-center gap-1.5 text-xs font-medium text-status-confirmed"
            data-testid="resend-success-text"
          >
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
            {sentMessage}
          </p>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-xs font-medium text-status-cancelled"
            data-testid="resend-error-text"
          >
            <AlertCircle aria-hidden="true" className="size-3.5" />
            {errorMessage}
          </p>
        )}

        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResend}
            disabled={isSending}
            aria-busy={isSending || undefined}
            data-testid="resend-verification-btn"
            className="bg-card text-foreground hover:bg-accent"
          >
            {isSending ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Mail aria-hidden="true" className="size-3.5" />
            )}
            {isSending ? 'Đang gửi...' : 'Gửi lại email xác thực'}
          </Button>
        </div>
      </div>
    </Alert>
  );
};
