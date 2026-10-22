import { useRef } from 'react';
import type * as React from 'react';
import { DESKTOP_MOTION_OK, EDITORIAL_EASE, MOTION_OK, gsap, useGSAP } from '@/lib/gsap';
import { cn } from '@/lib/utils';

type RevealTag = 'div' | 'section' | 'header' | 'ul' | 'ol' | 'figure' | 'article';

interface RevealProps extends React.HTMLAttributes<HTMLElement> {
  as?: RevealTag;
  /** Start offset in px (16–32 recommended). */
  y?: number;
  duration?: number;
  /** Seconds between `[data-reveal]` children. */
  stagger?: number;
  delay?: number;
  /** Animate on mount instead of when scrolled into view (hero). */
  immediate?: boolean;
}

/**
 * Fades + lifts its `[data-reveal]` descendants (or itself) once, when it enters the viewport.
 * Content is fully visible when motion is reduced, matchMedia is unavailable, or JS fails:
 * the hidden start state is only applied by GSAP at the moment the animation is created.
 */
export function Reveal({
  as = 'div',
  y = 24,
  duration = 0.6,
  stagger = 0.08,
  delay = 0,
  immediate = false,
  children,
  ...props
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || typeof window.matchMedia !== 'function') return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const marked = el.querySelectorAll<HTMLElement>('[data-reveal]');
        const targets = marked.length > 0 ? Array.from(marked) : [el];
        gsap.from(targets, {
          y,
          autoAlpha: 0,
          duration,
          delay,
          stagger,
          ease: EDITORIAL_EASE,
          clearProps: 'transform,opacity,visibility',
          scrollTrigger: immediate ? undefined : { trigger: el, start: 'top 85%', once: true },
        });
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

interface ParallaxImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Classes for the frame; give it a size or aspect ratio (it is `relative overflow-hidden`). */
  frameClassName?: string;
}

/** Image is 108% of the frame height, so a ±3% drift never exposes the frame edge. */
const DRIFT = 6;

/**
 * Image inside a fixed-ratio frame: settles from scale 1.04 on mount and drifts a few percent
 * with scroll on desktop. The frame keeps its size, so layout never shifts.
 */
export function ParallaxImage({ frameClassName, className, ...img }: ParallaxImageProps) {
  const drift = DRIFT;
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useGSAP(
    () => {
      const frame = frameRef.current;
      const image = imgRef.current;
      if (!frame || !image || typeof window.matchMedia !== 'function') return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(image, { scale: 1.04, duration: 1.2, ease: EDITORIAL_EASE });
      });
      mm.add(DESKTOP_MOTION_OK, () => {
        gsap.fromTo(
          image,
          { yPercent: -drift / 2 },
          {
            yPercent: drift / 2,
            ease: 'none',
            scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true },
          },
        );
      });
      return () => mm.revert();
    },
    { scope: frameRef },
  );

  return (
    <div ref={frameRef} className={cn('relative overflow-hidden', frameClassName)}>
      <img
        ref={imgRef}
        className={cn('absolute inset-x-0 -top-[4%] h-[108%] w-full object-cover', className)}
        {...img}
      />
    </div>
  );
}
