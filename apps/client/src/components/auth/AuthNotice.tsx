import type * as React from 'react';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface AuthNoticeProps {
  /** danger = request failed, warning = session expired, success = confirmation. */
  tone: 'danger' | 'warning' | 'success';
  children: React.ReactNode;
}

const TONE_CLASSES: Record<AuthNoticeProps['tone'], string> = {
  danger: 'border-status-cancelled-border bg-status-cancelled-bg text-status-cancelled',
  warning: 'border-status-noshow-border bg-status-noshow-bg text-status-noshow',
  success: 'border-status-success-border bg-status-success-bg text-status-success',
};

const TONE_ICONS = { danger: CircleAlert, warning: Clock, success: CircleCheck };

/** Inline notice for auth forms: danger/warning use role="alert", success uses role="status". */
export function AuthNotice({ tone, children }: AuthNoticeProps) {
  const Icon = TONE_ICONS[tone];

  return (
    <Alert
      role={tone === 'success' ? 'status' : 'alert'}
      data-tone={tone}
      className={cn(TONE_CLASSES[tone])}
    >
      <Icon aria-hidden="true" />
      <AlertDescription className="text-current">{children}</AlertDescription>
    </Alert>
  );
}
