import type { Transition, Variants } from 'motion/react';

/**
 * Motion tokens. Keep motion short, transform/opacity only, and never block input.
 * Mirrors the CSS `--ease-editorial` token in index.css.
 */
export const EASE_EDITORIAL = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  fast: 0.15,
  base: 0.2,
  slow: 0.32,
  enter: 0.45,
} as const;

export const enterTransition: Transition = { duration: DURATION.enter, ease: EASE_EDITORIAL };

/** Child of a stagger group: fades in while rising 8px. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: enterTransition },
};

/** Parent that reveals its `fadeRise` children one after another. */
export function staggerChildren(stagger = 0.06, delayChildren = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren } },
  };
}
