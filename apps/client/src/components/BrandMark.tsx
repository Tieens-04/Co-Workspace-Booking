import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  to?: string;
  className?: string;
  onNavigate?: () => void;
  /** Hide the "Working" eyebrow where horizontal space is tight. */
  compact?: boolean;
}

/** Wordmark link: tight sans "Co-Space." with a small "Working" eyebrow. */
export function BrandMark({ to = '/', className, onNavigate, compact = false }: BrandMarkProps) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-label="Trang chủ Co-Space"
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-sm whitespace-nowrap text-foreground no-underline',
        className,
      )}
    >
      <span className="text-[1.375rem] leading-none font-bold tracking-[-0.04em]">Co-Space.</span>
      {!compact && (
        <span className="text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Working
        </span>
      )}
    </Link>
  );
}
