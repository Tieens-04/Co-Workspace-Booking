import { useRef } from 'react';
import type * as React from 'react';
import { MOTION_OK, SplitText, gsap, useGSAP } from '@/lib/gsap';

type ScrubTag = 'h2' | 'h3' | 'p' | 'div';

interface ScrubTextProps extends React.HTMLAttributes<HTMLElement> {
  as?: ScrubTag;
}

/**
 * Words brighten from 20% to full opacity as the block scrolls up the viewport, so long
 * statements read at the pace of the scroll. Ends fully opaque; untouched without motion.
 */
export function ScrubText({ as = 'p', children, ...props }: ScrubTextProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || typeof window.matchMedia !== 'function') return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const split = SplitText.create(el, {
          type: 'words',
          autoSplit: true,
          aria: 'auto',
          onSplit(self) {
            return gsap.fromTo(
              self.words,
              { opacity: 0.2 },
              {
                opacity: 1,
                ease: 'none',
                stagger: 0.08,
                scrollTrigger: { trigger: el, start: 'top 85%', end: 'bottom 45%', scrub: 0.6 },
              },
            );
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
