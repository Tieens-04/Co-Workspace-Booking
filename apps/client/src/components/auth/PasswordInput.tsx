import type * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<React.ComponentProps<'input'>, 'type'> {
  visible: boolean;
  onToggleVisible: () => void;
  /** Accessible names of the toggle, e.g. "Hiện mật khẩu" / "Ẩn mật khẩu". */
  showLabel: string;
  hideLabel: string;
}

/**
 * Password input with a show/hide toggle. Forwards id/aria props to the <input>,
 * so it can be the child of `Field`.
 */
export function PasswordInput({
  visible,
  onToggleVisible,
  showLabel,
  hideLabel,
  className,
  disabled,
  ...props
}: PasswordInputProps) {
  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        className={cn('pr-11', className)}
        disabled={disabled}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground active:-translate-y-1/2 hover:text-foreground"
        onClick={onToggleVisible}
        aria-label={visible ? hideLabel : showLabel}
        disabled={disabled}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}
