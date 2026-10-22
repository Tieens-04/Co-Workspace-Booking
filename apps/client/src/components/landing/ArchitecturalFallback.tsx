import { cn } from '@/lib/utils';

interface ArchitecturalFallbackProps {
  className?: string;
  /** `ink` for dark editorial bands, `paper` for light sections. */
  tone?: 'paper' | 'ink';
}

/**
 * Stand-in for a missing room photo: a quiet plan-grid drawn with token-coloured gradients.
 * Fills its (fixed-ratio) parent, so loading, missing and failed images never shift layout.
 */
export function ArchitecturalFallback({ className, tone = 'paper' }: ArchitecturalFallbackProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'absolute inset-0 flex items-end p-5',
        tone === 'paper' ? 'bg-muted' : 'bg-on-ink/5',
        // Plan grid (96px) + one diagonal "section line".
        '[background-image:linear-gradient(135deg,transparent_calc(50%-0.5px),var(--border)_calc(50%-0.5px),var(--border)_calc(50%+0.5px),transparent_calc(50%+0.5px)),repeating-linear-gradient(90deg,var(--border)_0_1px,transparent_1px_96px),repeating-linear-gradient(0deg,var(--border)_0_1px,transparent_1px_96px)]',
        className,
      )}
    >
      <span className="eyebrow">Co-Space</span>
    </div>
  );
}
