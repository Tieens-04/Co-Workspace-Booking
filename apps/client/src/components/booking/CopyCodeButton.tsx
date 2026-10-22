import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CopyCodeButtonProps {
  code: string;
  className?: string;
}

/** Outline button that copies a booking code and briefly confirms it. */
export function CopyCodeButton({ code, className }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(code);
    } catch {
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={handleCopy}
      aria-label="Sao chép mã đặt phòng"
    >
      {copied ? (
        <Check aria-hidden="true" className="text-status-success" />
      ) : (
        <Copy aria-hidden="true" />
      )}
      <span aria-live="polite">{copied ? 'Đã chép' : 'Sao chép'}</span>
    </Button>
  );
}
