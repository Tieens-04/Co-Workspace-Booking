import { useRef } from 'react';
import type * as React from 'react';
import { DESKTOP_MOTION_OK, MOTION_OK, REVEAL_EASE, gsap, useGSAP } from '@/lib/gsap';
import { cn } from '@/lib/utils';

interface RevealImageProps {
  /** Frame classes: size or aspect ratio, radius. The frame is `relative overflow-hidden`. */
  className?: string;
  /** `mount` for above-the-fold images, `scroll` (once) elsewhere. */
  trigger?: 'mount' | 'scroll';
  delay?: number;
  /** Drift the picture with scroll on desktop (needs the oversized inner layer). */
  parallax?: boolean;
  /** The image (or fallback). It may carry its own CSS hover transform — GSAP never touches it. */
  children: React.ReactNode;
}

/**
 * Curtain reveal: the frame opens bottom-up (clip-path) while the picture settles from 1.18x,
 * then optionally drifts ±4% while the frame crosses the viewport. Three separate layers so
 * GSAP (frame + inner) and CSS hover (child) never animate the same element.
 */
export function RevealImage({
  className,
  trigger = 'scroll',
  delay = 0,
  parallax = false,
  children,
}: RevealImageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const frame = frameRef.current;
      const inner = innerRef.current;
      if (!frame || !inner || typeof window.matchMedia !== 'function') return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const scrollTrigger =
          trigger === 'scroll' ? { trigger: frame, start: 'top 85%', once: true } : undefined;
        gsap.from(frame, {
          clipPath: 'inset(100% 0% 0% 0%)',
          duration: 1.3,
          delay,
          ease: REVEAL_EASE,
          clearProps: 'clipPath',
          scrollTrigger,
        });
        gsap.from(inner, {
          scale: 1.18,
          duration: 1.6,
          delay,
          ease: REVEAL_EASE,
          scrollTrigger,
        });
      });
      if (parallax) {
        mm.add(DESKTOP_MOTION_OK, () => {
          gsap.fromTo(
            inner,
            { yPercent: -4 },
            {
              yPercent: 4,
              ease: 'none',
              scrollTrigger: {
                trigger: frame,
                start: 'top bottom',
                end: 'bottom top',
                scrub: true,
              },
            },
          );
        });
      }
      return () => mm.revert();
    },
    { scope: frameRef },
  );

  return (
    <div ref={frameRef} className={cn('relative overflow-hidden', className)}>
      {/* 110% tall so the ±4% drift never shows the frame edge. */}
      <div
        ref={innerRef}
        className={cn('absolute inset-x-0', parallax ? '-top-[5%] h-[110%]' : 'inset-y-0')}
      >
        {children}
      </div>
    </div>
  );
}
