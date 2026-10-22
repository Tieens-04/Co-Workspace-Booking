import { useRef } from 'react';
import type * as React from 'react';
import { MOTION_OK, REVEAL_EASE, SplitText, gsap, useGSAP } from '@/lib/gsap';

type SplitTag = 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';

interface SplitRevealProps extends React.HTMLAttributes<HTMLElement> {
  as?: SplitTag;
  /** Unit that slides up out of its line mask. */
  by?: 'chars' | 'words' | 'lines';
  /** `mount` for the hero, `scroll` (once, at 85% of the viewport) elsewhere. */
  trigger?: 'mount' | 'scroll';
  delay?: number;
  stagger?: number;
  duration?: number;
}

/**
 * Masked text reveal: each char / word / line rises out of a clipped line (the "architecture
 * studio" headline effect). SplitText keeps an aria-label with the full sentence and re-splits on
 * resize and font load. Without JS, with reduced motion, or in tests the text renders untouched.
 */
export function SplitReveal({
  as = 'div',
  by = 'words',
  trigger = 'scroll',
  delay = 0,
  stagger,
  duration = 1,
  children,
  ...props
}: SplitRevealProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || typeof window.matchMedia !== 'function') return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const split = SplitText.create(el, {
          type: by === 'chars' ? 'lines,words,chars' : by === 'words' ? 'lines,words' : 'lines',
          mask: 'lines',
          linesClass: 'split-line',
          autoSplit: true,
          aria: 'auto',
          onSplit(self) {
            const targets = by === 'chars' ? self.chars : by === 'words' ? self.words : self.lines;
            return gsap.from(targets, {
              yPercent: 110,
              duration,
              delay,
              ease: REVEAL_EASE,
              stagger: stagger ?? (by === 'chars' ? 0.022 : by === 'words' ? 0.05 : 0.09),
              scrollTrigger:
                trigger === 'scroll' ? { trigger: el, start: 'top 88%', once: true } : undefined,
            });
          },
        });
        return () => split.revert();
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  const Tag = as as React.ElementType;
  return (
    <Tag ref={ref} {...props}>
      {children}
    </Tag>
  );
}
