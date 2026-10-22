import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatVnd } from '../../utils/format';

interface MobileBookingBarProps {
  pricePerHour: string;
  /** id of the booking panel this bar scrolls to and focuses. */
  targetId: string;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Fixed bottom call-to-action on small screens. Hides itself (and leaves the tab order) while the
 * booking panel is on screen or already scrolled past, and respects the bottom safe-area inset.
 * The page must reserve bottom padding so the bar never covers content.
 */
export function MobileBookingBar({ pricePerHour, targetId }: MobileBookingBarProps) {
  const [panelReached, setPanelReached] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof window.IntersectionObserver !== 'function') return;

    const observer = new window.IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      setPanelReached(entry.isIntersecting || entry.boundingClientRect.top < 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  const handleClick = () => {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  };

  return (
    <div
      role="region"
      aria-label="Đặt chỗ nhanh"
      data-testid="mobile-booking-bar"
      data-state={panelReached ? 'hidden' : 'visible'}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md transition-[transform,opacity,visibility] duration-300 ease-editorial lg:hidden',
        panelReached ? 'invisible translate-y-full opacity-0' : 'visible translate-y-0 opacity-100',
      )}
    >
      <div className="container-page flex items-center justify-between gap-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="grid min-w-0 leading-tight">
          <span className="text-xs text-muted-foreground">Giá thuê</span>
          <span className="truncate text-[1.0625rem] font-bold tabular-nums">
            {formatVnd(pricePerHour)}
          </span>
        </p>
        <Button type="button" className="min-w-36" onClick={handleClick}>
          <CalendarClock aria-hidden="true" />
          Đặt chỗ
        </Button>
      </div>
    </div>
  );
}
