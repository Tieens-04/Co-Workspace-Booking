import { useRef } from 'react';
import { MOTION_OK, gsap, useGSAP } from '@/lib/gsap';
import { cn } from '@/lib/utils';

/** Hairline that draws itself left → right once it scrolls into view (decorative). */
export function DrawRule({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || typeof window.matchMedia !== 'function') return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(el, {
          scaleX: 0,
          duration: 1.4,
          ease: 'expo.inOut',
          scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <div ref={ref} aria-hidden="true" className={cn('h-px origin-left bg-border', className)} />
  );
}
